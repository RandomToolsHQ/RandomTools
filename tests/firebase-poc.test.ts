import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { importPKCS8, SignJWT } from "jose";
import worker from "../experiments/firebase/worker";
import { identity } from "../experiments/firebase/identity";
vi.setConfig({ testTimeout: 20000, hookTimeout: 30000 });
const gateway = vi.hoisted(() => vi.fn());
vi.mock("../worker/access", async (original) => ({
  ...(await original<any>()),
  requireStagingAccess: gateway,
}));
let mf: Miniflare,
  db: Awaited<ReturnType<Miniflare["getD1Database"]>>,
  key: Awaited<ReturnType<typeof importPKCS8>>,
  cert: string,
  serial = 0,
  uid: string,
  env: any,
  profile: any,
  lookupCount = 0,
  providerFailure = 0,
  deleted = false;
const origin = "https://firebase-poc.example.test",
  project = "demo-randomtools-poc",
  issuer = "https://securetoken.google.com/" + project,
  ts = () => Math.floor(Date.now() / 1000);
const jwt = (
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
) =>
  new SignJWT({
    sub: uid,
    aud: project,
    iss: issuer,
    iat: ts(),
    exp: ts() + 3600,
    auth_time: ts() - 1,
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-rsa-key", ...header })
    .sign(key);
async function call(
  path: string,
  token: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  cookie = "",
) {
  return worker.fetch(
    new Request(origin + "/api" + path, {
      method,
      headers: {
        authorization: "Bearer " + token,
        origin,
        "content-type": "application/json",
        cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
}
async function login(token?: string) {
  const raw = token || (await jwt());
  const r = await call("/session", raw, {});
  expect(r.status).toBe(200);
  return { token: raw, cookie: r.headers.get("set-cookie")!.split(";")[0] };
}
beforeAll(async () => {
  const dir = await mkdtemp(resolve(".wrangler/firebase-test-")),
    openssl =
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
      "/CN=synthetic-firebase-poc",
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
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('synthetic')}}",
      d1Databases: ["DB"],
    }),
  );
  db = await mf.getD1Database("DB");
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  await db.exec(
    (await readFile("experiments/firebase/0006_poc_sessions.sql", "utf8"))
      .replace(/^--.*$/gm, "")
      .trim(),
  );
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
afterEach(() => vi.unstubAllGlobals());
beforeEach(async () => {
  uid = "synthetic_firebase_" + serial++;
  lookupCount = 0;
  providerFailure = 0;
  deleted = false;
  profile = {
    localId: uid,
    email: uid + "@example.test",
    emailVerified: true,
    disabled: false,
    validSince: String(ts() - 100),
    displayName: "Synthetic member",
  };
  env = {
    DB: db,
    ENVIRONMENT: "firebase-poc",
    APP_ORIGIN: origin,
    FIREBASE_PROJECT_ID: project,
    FIREBASE_WEB_API_KEY: "synthetic-api-key-not-a-credential",
    FIREBASE_TESTER_IDS: JSON.stringify([uid]),
    RATE_LIMIT_SECRET: "synthetic-rate-secret-".repeat(3),
  };
  gateway.mockResolvedValue(profile.email);
  await db.exec("DELETE FROM rate_limits;");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      if (
        String(url) ===
        "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
      )
        return Response.json(
          { "synthetic-rsa-key": cert },
          { headers: { "cache-control": "public,max-age=3600" } },
        );
      if (String(url).includes("accounts:lookup?")) {
        lookupCount++;
        if (providerFailure)
          return Response.json(
            { error: { message: "PRIVATE provider diagnostics" } },
            { status: providerFailure },
          );
        return Response.json(
          deleted
            ? { error: { message: "USER_NOT_FOUND" } }
            : { users: [profile] },
          { status: deleted ? 400 : 200 },
        );
      }
      if (String(url).includes("accounts:delete?")) {
        if (providerFailure)
          return Response.json(
            { error: { message: "PRIVATE" } },
            { status: providerFailure },
          );
        deleted = true;
        return Response.json({});
      }
      throw Error("Unexpected network destination");
    }),
  );
});
it("verifies real RSA signatures and exact issuer/audience/expiry/issued-at/auth-time/verified claims", async () => {
  expect(
    (
      await identity(
        new Request(origin, {
          headers: { authorization: "Bearer " + (await jwt()) },
        }),
        env,
        profile.email,
      )
    ).subject,
  ).toBe(uid);
  for (const claims of [
    { iss: "https://attacker.test" },
    { aud: "another-project" },
    { aud: [project, "other"] },
    { exp: ts() - 2 },
    { iat: ts() + 100 },
    { auth_time: ts() + 100 },
    { auth_time: -1 },
    { sub: "" },
    { email_verified: false },
  ])
    expect((await call("/session", await jwt(claims), {})).status).toBe(401);
  const token = await jwt(),
    parts = token.split(".");
  parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
  expect((await call("/session", parts.join("."), {})).status).toBe(401);
  expect(
    (await call("/session", await jwt({}, { kid: "untrusted-key" }), {}))
      .status,
  ).toBe(401);
  expect((await call("/session", "e30.eyJzdWIiOiJmYWtlIn0.", {})).status).toBe(
    401,
  );
});
it("rereads live revocation state and compares auth_time rather than a refreshed iat", async () => {
  const token = await jwt({ auth_time: ts() - 20 }),
    s = await login(token);
  expect((await call("/me", token, undefined, "GET", s.cookie)).status).toBe(
    200,
  );
  expect(lookupCount).toBe(2);
  profile.validSince = String(ts() - 10);
  expect(
    (
      await call(
        "/me",
        await jwt({ auth_time: ts() - 20, iat: ts() }),
        undefined,
        "GET",
        s.cookie,
      )
    ).status,
  ).toBe(401);
});
it("fails closed on missing revocation state, deleted/disabled/unverified profiles and provider throttling", async () => {
  const token = await jwt();
  for (const patch of [
    { validSince: undefined },
    { disabled: true },
    { emailVerified: false },
    { localId: "wrong-user" },
  ]) {
    const before = { ...profile };
    Object.assign(profile, patch);
    expect([401, 503]).toContain((await call("/session", token, {})).status);
    profile = before;
  }
  providerFailure = 429;
  const r = await call("/session", token, {});
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("PRIVATE");
});
it("rejects unsupported environment, non-allowlisted UID, wrong gateway email and injected roles", async () => {
  const token = await jwt();
  env.ENVIRONMENT = "production";
  expect((await call("/session", token, {})).status).toBe(503);
  env.ENVIRONMENT = "firebase-poc";
  env.FIREBASE_TESTER_IDS = "[]";
  expect((await call("/session", token, {})).status).toBe(503);
  env.FIREBASE_TESTER_IDS = '["other"]';
  expect((await call("/session", token, {})).status).toBe(403);
  env.FIREBASE_TESTER_IDS = JSON.stringify([uid]);
  gateway.mockResolvedValue("other@example.test");
  expect((await call("/session", token, {})).status).toBe(403);
  gateway.mockResolvedValue(profile.email);
  const s = await login(token);
  expect(
    (
      await call(
        "/account",
        token,
        { name: "Synthetic", role: "admin" },
        "PATCH",
        s.cookie,
      )
    ).status,
  ).toBe(400);
});
it("never links a matching legacy/Clerk email or accepts Firebase custom claims as Admin/Pro", async () => {
  await db
    .prepare(
      "INSERT INTO users VALUES(?,?,'Synthetic legacy admin','managed:clerk','admin',1,0,1)",
    )
    .bind("legacy_" + uid, profile.email)
    .run();
  expect(
    (
      await call(
        "/session",
        await jwt({ admin: true, role: "admin", pro: true }),
        {},
      )
    ).status,
  ).toBe(403);
  expect(
    await db
      .prepare("SELECT count(*) n FROM auth_identities WHERE subject=?")
      .bind(uid)
      .first("n"),
  ).toBe(0);
});
it("requires both ID token and owned bound HttpOnly session; logout rejects old tokens even at session bootstrap", async () => {
  const s = await login();
  const me = await call("/me", s.token, undefined, "GET", s.cookie);
  expect(await me.json()).toMatchObject({ user: { role: "free" }, pro: false });
  expect((await call("/me", s.token)).status).toBe(401);
  const logout = await call("/logout", s.token, {}, "POST", s.cookie);
  expect(logout.status).toBe(200);
  expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  expect((await call("/me", s.token, undefined, "GET", s.cookie)).status).toBe(
    401,
  );
  expect((await call("/session", s.token, {})).status).toBe(401);
  expect(
    await db
      .prepare(
        "SELECT count(*) n FROM audit_logs WHERE action='poc.session.revoke-all' AND actor_id=(SELECT user_id FROM auth_identities WHERE subject=?)",
      )
      .bind(uid)
      .first("n"),
  ).toBe(1);
});
it("enforces fresh Pro/Admin database state, entitlement expiry and cross-user preset ownership", async () => {
  const s = await login(),
    me = (await (
      await call("/me", s.token, undefined, "GET", s.cookie)
    ).json()) as any,
    id = me.user.id;
  expect(
    (await call("/admin", s.token, undefined, "GET", s.cookie)).status,
  ).toBe(403);
  expect(
    (await call("/pro/presets", s.token, undefined, "GET", s.cookie)).status,
  ).toBe(403);
  await db
    .prepare(
      "INSERT INTO pro_grants(id,user_id,duration,granted_at) VALUES(?,?,'permanent',1)",
    )
    .bind(uid, id)
    .run();
  expect(
    (
      await call(
        "/pro/presets",
        s.token,
        { name: "Own", data: { synthetic: true } },
        "POST",
        s.cookie,
      )
    ).status,
  ).toBe(200);
  const victim = "victim_" + uid;
  await db
    .prepare(
      "INSERT INTO users VALUES(?,?,'Synthetic victim','managed:firebase','free',1,0,1)",
    )
    .bind(victim, victim + "@example.test")
    .run();
  await db
    .prepare("INSERT INTO saved_presets VALUES(?,?,'preset','Victim','{}',1)")
    .bind(victim, victim)
    .run();
  await call("/pro/presets", s.token, { id: victim }, "DELETE", s.cookie);
  expect(
    await db
      .prepare("SELECT id FROM saved_presets WHERE id=?")
      .bind(victim)
      .first(),
  ).not.toBeNull();
  const exported = (await (
    await call(
      "/account/export?user_id=" + victim,
      s.token,
      undefined,
      "GET",
      s.cookie,
    )
  ).json()) as any;
  expect(exported.profile.id).toBe(id);
  expect(exported.saved_presets).toHaveLength(1);
  await db
    .prepare("UPDATE pro_grants SET revoked_at=? WHERE id=?")
    .bind(ts(), uid)
    .run();
  expect(
    (await call("/pro/presets", s.token, undefined, "GET", s.cookie)).status,
  ).toBe(403);
  await db.prepare("UPDATE users SET role='admin' WHERE id=?").bind(id).run();
  expect(
    (await call("/admin", s.token, undefined, "GET", s.cookie)).status,
  ).toBe(200);
  expect(
    (
      await call(
        "/account",
        s.token,
        { confirmation: "DELETE" },
        "DELETE",
        s.cookie,
      )
    ).status,
  ).toBe(403);
  await db.prepare("UPDATE users SET role='free' WHERE id=?").bind(id).run();
  expect(
    (await call("/admin", s.token, undefined, "GET", s.cookie)).status,
  ).toBe(403);
});
it("deletes a recent synthetic identity and owned records with tombstone/audits", async () => {
  const s = await login(),
    me = (await (
      await call("/me", s.token, undefined, "GET", s.cookie)
    ).json()) as any,
    id = me.user.id;
  await db
    .prepare(
      "INSERT INTO saved_presets VALUES(?,?,'preset','Synthetic','{}',1)",
    )
    .bind(uid, id)
    .run();
  expect(
    (
      await call(
        "/account",
        s.token,
        { confirmation: "NO" },
        "DELETE",
        s.cookie,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        "/account",
        s.token,
        { confirmation: "DELETE" },
        "DELETE",
        s.cookie,
      )
    ).status,
  ).toBe(200);
  expect(deleted).toBe(true);
  expect(
    await db.prepare("SELECT id FROM users WHERE id=?").bind(id).first(),
  ).toBeNull();
  expect(
    await db
      .prepare("SELECT id FROM saved_presets WHERE user_id=?")
      .bind(id)
      .first(),
  ).toBeNull();
  expect(
    await db
      .prepare("SELECT state FROM auth_identities WHERE subject=?")
      .bind(uid)
      .first("state"),
  ).toBe("deleted");
  expect(
    await db
      .prepare(
        "SELECT count(*) n FROM audit_logs WHERE target_id=? AND action='poc.account.delete.completed'",
      )
      .bind(id)
      .first("n"),
  ).toBe(1);
});
it("blocks cross-origin writes, disabled account reuse and every payment ingress", async () => {
  const s = await login();
  const bad = await worker.fetch(
    new Request(origin + "/api/logout", {
      method: "POST",
      headers: {
        origin: "https://attacker.test",
        "content-type": "application/json",
        authorization: "Bearer " + s.token,
        cookie: s.cookie,
      },
      body: "{}",
    }),
    env,
  );
  expect(bad.status).toBe(403);
  expect(
    (await call("/webhooks/kofi", s.token, {}, "POST", s.cookie)).status,
  ).toBe(404);
  await db
    .prepare(
      "UPDATE users SET disabled=1 WHERE id=(SELECT user_id FROM auth_identities WHERE subject=?)",
    )
    .bind(uid)
    .run();
  expect((await call("/me", s.token, undefined, "GET", s.cookie)).status).toBe(
    403,
  );
});
it("refuses an existing database without the isolated marker before authentication or writes", async () => {
  await db.prepare("DELETE FROM poc_metadata WHERE key='isolation'").run();
  try {
    expect((await call("/session", await jwt(), {})).status).toBe(503);
    expect(
      await db
        .prepare("SELECT count(*) n FROM auth_identities WHERE subject=?")
        .bind(uid)
        .first("n"),
    ).toBe(0);
    expect(lookupCount).toBe(0);
  } finally {
    await db
      .prepare(
        "INSERT INTO poc_metadata VALUES('isolation','randomtools-firebase-poc-v1')",
      )
      .run();
  }
});
it("rejects expired, duplicated, mismatched-auth-time and cross-user application cookies", async () => {
  const s = await login();
  expect(
    (await call("/me", s.token, undefined, "GET", s.cookie + "; " + s.cookie))
      .status,
  ).toBe(401);
  expect(
    (
      await call(
        "/me",
        await jwt({ auth_time: ts() - 10 }),
        undefined,
        "GET",
        s.cookie,
      )
    ).status,
  ).toBe(401);
  await db
    .prepare(
      "UPDATE sessions SET expires_at=1 WHERE user_id=(SELECT user_id FROM auth_identities WHERE subject=?)",
    )
    .bind(uid)
    .run();
  expect((await call("/me", s.token, undefined, "GET", s.cookie)).status).toBe(
    401,
  );
  const first = await login();
  uid += "_other";
  profile = { ...profile, localId: uid, email: uid + "@example.test" };
  env.FIREBASE_TESTER_IDS = JSON.stringify([uid]);
  gateway.mockResolvedValue(profile.email);
  expect(
    (await call("/me", await jwt(), undefined, "GET", first.cookie)).status,
  ).toBe(401);
});
it("rolls back local logout/deletion state when the required audit cannot be written", async () => {
  const s = await login();
  await db.exec(
    "CREATE TRIGGER refuse_poc_audit BEFORE INSERT ON audit_logs WHEN NEW.action IN ('poc.session.revoke-all','poc.account.delete.requested') BEGIN SELECT RAISE(ABORT,'synthetic audit outage'); END;",
  );
  try {
    expect((await call("/logout", s.token, {}, "POST", s.cookie)).status).toBe(
      503,
    );
    expect(
      (await call("/me", s.token, undefined, "GET", s.cookie)).status,
    ).toBe(200);
    expect(
      (
        await call(
          "/account",
          s.token,
          { confirmation: "DELETE" },
          "DELETE",
          s.cookie,
        )
      ).status,
    ).toBe(503);
    expect(deleted).toBe(false);
    expect(
      await db
        .prepare("SELECT state FROM auth_identities WHERE subject=?")
        .bind(uid)
        .first("state"),
    ).toBe("active");
  } finally {
    await db.exec("DROP TRIGGER refuse_poc_audit;");
  }
});
