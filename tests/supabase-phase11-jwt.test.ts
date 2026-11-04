import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, readFile, unlink, rmdir, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { importPKCS8, SignJWT } from "jose";
import { makeAuthenticator, type Config } from "../experiments/supabase/core";
import { digest } from "../worker/security";
const c: Config = {
  enabled: "phase11-synthetic-only",
  projectRef: "a".repeat(20),
  origin: "http://127.0.0.1:54381",
  accessKey: "a".repeat(64),
  firebaseProject: "randomtools-supabase-auth-poc",
  firebaseKey: "synthetic-public",
  rateSecret: "r".repeat(32),
  serviceKey: "synthetic-private",
  testExpiresAt: Math.floor(Date.now() / 1000) + 3600,
  testers: { member: "phase11-00000000-member@example.com" },
};
let key: Awaited<ReturnType<typeof importPKCS8>>, cert: string;
const ts = () => Math.floor(Date.now() / 1000);
beforeAll(async () => {
  await mkdir(".wrangler", { recursive: true });
  const dir = await mkdtemp(resolve(".wrangler/phase11-jwt-"));
  const openssl =
    process.platform === "win32" &&
    existsSync("C:/Program Files/Git/usr/bin/openssl.exe")
      ? "C:/Program Files/Git/usr/bin/openssl.exe"
      : "openssl";
  execFileSync(
    openssl,
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-subj",
      "/CN=phase11-synthetic",
      "-days",
      "1",
      "-keyout",
      dir + "/key.pem",
      "-out",
      dir + "/cert.pem",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  key = await importPKCS8(await readFile(dir + "/key.pem", "utf8"), "RS256");
  cert = await readFile(dir + "/cert.pem", "utf8");
  await unlink(dir + "/key.pem");
  await unlink(dir + "/cert.pem");
  await rmdir(dir);
});
afterEach(() => vi.unstubAllGlobals());
async function jwt(claims: Record<string, unknown> = {}) {
  return new SignJWT({
    sub: "member",
    aud: c.firebaseProject,
    iss: "https://securetoken.google.com/" + c.firebaseProject,
    iat: ts(),
    exp: ts() + 3600,
    auth_time: ts() - 10,
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "phase11-synthetic" })
    .sign(key);
}
function provider(profile: Record<string, unknown> = {}, status = 200) {
  const mock = vi.fn(async (url: unknown) =>
    String(url).includes("/metadata/x509/")
      ? Response.json(
          { "phase11-synthetic": cert },
          { headers: { "cache-control": "max-age=3600" } },
        )
      : Response.json(
          {
            users: [
              {
                localId: "member",
                email: c.testers.member,
                emailVerified: true,
                disabled: false,
                validSince: String(ts() - 100),
                ...profile,
              },
            ],
          },
          { status },
        ),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}
const request = (raw: string) =>
  new Request("https://synthetic.example", {
    headers: {
      authorization: "Bearer " + raw,
      "x-poc-tester": digest(c.testers.member),
    },
  });
it("real RSA verification plus uncached provider check every request", async () => {
  const mock = provider();
  const token = await jwt();
  const verify = makeAuthenticator(c);
  expect((await verify(request(token))).subject).toBe("member");
  await verify(request(token));
  expect(
    mock.mock.calls.filter(([url]) => String(url).includes("accounts:lookup")),
  ).toHaveLength(2);
});
it("requires the trusted named staging identity to match the token allowlist entry", async () => {
  provider();
  const req = request(await jwt());
  req.headers.set("x-poc-tester", digest("phase11-00000000-other@example.com"));
  await expect(makeAuthenticator(c)(req)).rejects.toMatchObject({
    status: 403,
  });
  req.headers.delete("x-poc-tester");
  await expect(makeAuthenticator(c)(req)).rejects.toMatchObject({
    status: 403,
  });
});
it.each([
  { aud: "wrong" },
  { iss: "https://evil.example" },
  { exp: 1 },
  { iat: 9999999999 },
  { auth_time: 9999999999 },
  { email_verified: false },
  { firebase: { tenant: "not-enabled" } },
])("rejects invalid signed claims %j", async (claims) => {
  provider();
  await expect(
    makeAuthenticator(c)(request(await jwt(claims))),
  ).rejects.toMatchObject({ status: 401 });
});
it("rejects forged signature and malformed JWT", async () => {
  provider();
  const raw = await jwt(),
    parts = raw.split(".");
  parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
  await expect(
    makeAuthenticator(c)(request(parts.join("."))),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    makeAuthenticator(c)(request("invalid.token.parts")),
  ).rejects.toMatchObject({ status: 401 });
});
it.each([
  { disabled: true },
  { emailVerified: false },
  { localId: "other" },
  { validSince: String(ts()) },
])("live inactive/revoked provider state denies %j", async (profile) => {
  provider(profile);
  await expect(
    makeAuthenticator(c)(request(await jwt())),
  ).rejects.toMatchObject({ status: 401 });
});
it("provider email collision cannot remap identity", async () => {
  provider({ email: "phase11-00000000-other@example.com" });
  await expect(
    makeAuthenticator(c)(request(await jwt())),
  ).rejects.toMatchObject({ status: 403 });
});
it.each([429, 500])("provider HTTP %s fails closed", async (status) => {
  provider({}, status);
  await expect(
    makeAuthenticator(c)(request(await jwt())),
  ).rejects.toMatchObject({ status: 503 });
});
