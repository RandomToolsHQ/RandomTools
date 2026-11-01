import { beforeAll, afterAll, it, expect } from "vitest";
import { SignJWT } from "jose";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { digest, now } from "../worker/security";
import { requireStagingAccess, stagingGateway } from "../worker/access";
import guard from "../staging/guard";
import api from "../worker/index";
import { vi } from "vitest";
const origin = "https://private.example.test",
  raw = "2".repeat(64),
  signing = "1".repeat(64);
let mf: Miniflare,
  env: any,
  session: string,
  serial = 0;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('fixture')}}",
      d1Databases: ["DB"],
    }),
  );
  const db = await mf.getD1Database("DB");
  await db.exec(
    "CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL)",
  );
  env = {
    STAGING_GATE_ORIGIN: origin,
    STAGING_GATE_SIGNING_KEY: signing,
    STAGING_GATE_TESTERS: JSON.stringify([
      {
        email: "approved@example.test",
        keyHash: digest(raw),
        expiresAt: now() + 86400,
      },
    ]),
    GATE_DB: db,
  };
  const response = await stagingGateway(post(), env);
  session = response.headers.get("set-cookie")!.split(";")[0];
});
afterAll(async () => {
  await mf?.dispose();
});
function post(
  body = new URLSearchParams({
    email: "approved@example.test",
    key: raw,
  }).toString(),
  ip = "198.51.100." + ++serial,
  path = "/__staging",
) {
  return new Request(origin + path, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
      "CF-Connecting-IP": ip,
    },
    body,
  });
}
function req(path = "/", cookie = session) {
  return new Request(origin + path, { headers: cookie ? { cookie } : {} });
}
it("fails closed on absent/malformed configuration and every alternate hostname", async () => {
  for (const config of [
    {},
    { ...env, STAGING_GATE_TESTERS: "[]" },
    { ...env, STAGING_GATE_SIGNING_KEY: "weak" },
    { ...env, STAGING_GATE_TESTERS: '[{"email":"bad"}]' },
  ])
    await expect(requireStagingAccess(req(), config)).rejects.toMatchObject({
      status: 503,
    });
  await expect(
    requireStagingAccess(
      new Request("https://hash.private.example.test", {
        headers: { cookie: session },
      }),
      env,
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("issues only bounded host-only Secure HttpOnly Lax cookies after a named-key login", async () => {
  const response = await stagingGateway(post(), env);
  expect(response.status).toBe(303);
  const value = response.headers.get("set-cookie")!;
  expect(value).toMatch(/^__Host-rt_staging=/);
  expect(value).toContain(
    "Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=1800",
  );
  expect(value).not.toContain("Domain=");
  expect(value).not.toContain(raw);
  expect(value).not.toContain("approved@example.test");
  expect(await requireStagingAccess(req(), env)).toBe("approved@example.test");
});
it("never accepts a Clerk bearer, Access email header, unsigned cookie or wrong named key", async () => {
  const request = new Request(origin, {
    headers: {
      authorization: "Bearer fake",
      "Cf-Access-Authenticated-User-Email": "approved@example.test",
      cookie: "__Host-rt_staging=fake",
    },
  });
  await expect(requireStagingAccess(request, env)).rejects.toMatchObject({
    status: 403,
  });
  for (const body of [
    "email=outsider%40example.test&key=" + raw,
    "email=approved%40example.test&key=" + "3".repeat(64),
    "email=approved%40example.test&key=" + raw + "&key=" + raw,
  ]) {
    const response = await stagingGateway(post(body), env);
    expect(response.status).toBe(403);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await response.text()).not.toContain(raw);
  }
});
it("rejects expired/future/old/wrong-party/overlong signed sessions and instant key revocation", async () => {
  const key = Uint8Array.from({ length: 32 }, () => 17),
    t = now();
  for (const claims of [
    { exp: t - 1 },
    { iat: t + 60 },
    { iat: t - 1801, exp: t + 1 },
    { iss: "https://other.example.test" },
    { aud: "other" },
    { exp: t + 3600 },
    { sub: digest("outsider@example.test") },
    { keyHash: digest("revoked") },
  ]) {
    const jwt = await new SignJWT({
      iss: origin,
      aud: "randomtools-private-staging",
      sub: digest("approved@example.test"),
      iat: t,
      exp: t + 300,
      keyHash: digest(raw),
      ...claims,
    })
      .setProtectedHeader({ alg: "HS256" })
      .sign(key);
    await expect(
      requireStagingAccess(req("/", "__Host-rt_staging=" + jwt), env),
    ).rejects.toMatchObject({ status: 403 });
  }
  await expect(
    requireStagingAccess(req(), {
      ...env,
      STAGING_GATE_TESTERS: JSON.stringify([
        {
          email: "approved@example.test",
          keyHash: digest("rotated"),
          expiresAt: t + 86400,
        },
      ]),
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    requireStagingAccess(req("/", session + "; " + session), env),
  ).rejects.toMatchObject({ status: 403 });
});
it("enforces exact-origin form writes, body bounds and persistent atomic rate limits", async () => {
  const cross = new Request(origin + "/__staging", {
    method: "POST",
    headers: {
      origin: "https://attacker.test",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "",
  });
  await expect(stagingGateway(cross, env)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    stagingGateway(post("x".repeat(1100)), env),
  ).rejects.toMatchObject({ status: 413 });
  const attempts = await Promise.all(
    Array.from({ length: 11 }, () =>
      stagingGateway(post("email=wrong&key=bad", "198.51.100.200"), env),
    ),
  );
  expect(attempts.filter((r) => r.status === 429)).toHaveLength(1);
  expect(attempts.filter((r) => r.status === 403)).toHaveLength(10);
});
it("logout clears the host cookie and the public gate form contains no account SDK", async () => {
  const response = await stagingGateway(
    post("", "198.51.100.201", "/__staging/logout"),
    env,
  );
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  const page = await stagingGateway(req("/__staging", ""), env);
  const html = await page.text();
  expect(html).toContain("Private staging access");
  expect(html).not.toMatch(/<script|accounts\.dev|pk_test_/);
});
it("protects every static/account/API route and separately disables account content by default", async () => {
  const assets = vi.fn(),
    backend = vi.fn();
  const bindings = {
    ...env,
    ASSETS: { fetch: assets },
    API: { fetch: backend },
  };
  for (const path of [
    "/",
    "/login",
    "/register",
    "/dashboard",
    "/admin",
    "/assets/app.js",
    "/robots.txt",
    "/api/me",
    "/api/webhooks/clerk",
    "/api/webhooks/kofi",
  ])
    expect((await guard.fetch(req(path, ""), bindings)).status).toBe(403);
  expect((await guard.fetch(req(), bindings)).status).toBe(503);
  expect(assets).not.toHaveBeenCalled();
  expect(backend).not.toHaveBeenCalled();
  assets.mockImplementation(() => new Response("private asset"));
  const response = await guard.fetch(req("/assets/app.js"), {
    ...bindings,
    STAGING_CONTENT_ENABLED: "true",
  });
  expect(await response.text()).toBe("private asset");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("same-origin");
  expect(response.headers.get("content-security-policy")).toBeTruthy();
});
it("the API independently enforces the gateway; only signed Clerk callbacks have machine ingress", async () => {
  const prepare = vi.fn();
  const config = {
    ...env,
    ENVIRONMENT: "staging",
    APP_ORIGIN: origin,
    RATE_LIMIT_SECRET: "fixture".repeat(8),
    AUTH_PROVIDER: "clerk",
    PAYMENTS_ENABLED: "false",
    DB: { prepare },
  } as any;
  expect((await api.fetch(req("/api/me", ""), config)).status).toBe(403);
  expect(prepare).not.toHaveBeenCalled();
  const response = await guard.fetch(
    new Request(origin + "/api/webhooks/clerk", { method: "POST", body: "{}" }),
    {
      ...env,
      ASSETS: { fetch: vi.fn() } as any,
      API: { fetch: (r: Request) => api.fetch(r, config) } as any,
    },
  );
  expect(response.status).toBe(503);
  expect(prepare).not.toHaveBeenCalled();
});
