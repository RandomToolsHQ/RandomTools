import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { managedCurrent, deleteManaged, managedWebhook } from "../worker/clerk";
import worker from "../worker/index";
const mock = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  verifyWebhook: vi.fn(),
}));
vi.mock("@clerk/backend", async (original) => ({
  ...(await original<any>()),
  createClerkClient: vi.fn(() => ({
    authenticateRequest: mock.authenticateRequest,
    sessions: { getSession: mock.getSession },
    users: { getUser: mock.getUser, deleteUser: mock.deleteUser },
  })),
}));
vi.mock("@clerk/backend/webhooks", () => ({
  verifyWebhook: mock.verifyWebhook,
}));
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
let serial = 0;
const origin = "https://staging.example.test";
const issuer = "https://fixture.clerk.accounts.dev";
let subject: string;
let env: any;
const req = () =>
  new Request(origin + "/api/me", {
    headers: { authorization: "Bearer synthetic-fixture" },
  });
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('fixture')}}",
      d1Databases: ["DB"],
    }),
  );
  db = await mf.getD1Database("DB");
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(() => {
  vi.clearAllMocks();
  subject = "user_fixture_" + serial++;
  env = {
    DB: db,
    APP_ORIGIN: origin,
    ENVIRONMENT: "staging",
    AUTH_PROVIDER: "clerk",
    CLERK_ISSUER: issuer,
    CLERK_SECRET_KEY: "sk_test_fixture_not_a_credential",
    CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
    RATE_LIMIT_SECRET: "synthetic-rate-limit-fixture-".repeat(2),
    PAYMENTS_ENABLED: "false",
  };
  mock.authenticateRequest.mockResolvedValue({
    isAuthenticated: true,
    toAuth: () => ({
      userId: subject,
      sessionId: "sess_fixture",
      sessionClaims: { iss: issuer, azp: origin, fva: [0, -1] },
    }),
  });
  mock.getSession.mockResolvedValue({
    status: "active",
    userId: subject,
    expireAt: Date.now() + 60000,
  });
  mock.getUser.mockResolvedValue({
    primaryEmailAddressId: "email_fixture",
    emailAddresses: [
      {
        id: "email_fixture",
        emailAddress: subject + "@example.test",
        verification: { status: "verified" },
      },
    ],
    fullName: "Fixture Member",
    banned: false,
    locked: false,
  });
});
describe("managed Clerk identity with real isolated D1", () => {
  it("maps immutable identities idempotently and retains internal roles/entitlements", async () => {
    const first = (await managedCurrent(req(), env))!;
    expect(first.role).toBe("free");
    await db
      .prepare("UPDATE users SET role='admin' WHERE id=?")
      .bind(first.id)
      .run();
    const again = (await managedCurrent(req(), env))!;
    expect(again.id).toBe(first.id);
    expect(again.role).toBe("admin");
    expect(mock.authenticateRequest).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        authorizedParties: [origin],
        acceptsToken: "session_token",
      }),
    );
    const api = await worker.fetch(req(), env);
    expect(await api.json()).toMatchObject({
      user: { id: first.id, role: "admin" },
      pro: true,
    });
  });
  it("never links or promotes by matching a legacy email", async () => {
    const email = subject + "@example.test";
    await db
      .prepare(
        "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,'Legacy','fixture','admin',1)",
      )
      .bind("legacy_" + subject, email)
      .run();
    await expect(managedCurrent(req(), env)).rejects.toThrow(
      "ownership review",
    );
    expect(
      await db
        .prepare("SELECT count(*) AS n FROM auth_identities WHERE subject=?")
        .bind(subject)
        .first("n"),
    ).toBe(0);
  });
  it("rejects invalid tokens and incorrect issuer without provisioning", async () => {
    mock.authenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    await expect(managedCurrent(req(), env)).rejects.toThrow("Sign in");
    mock.authenticateRequest.mockResolvedValueOnce({
      isAuthenticated: true,
      toAuth: () => ({
        userId: subject,
        sessionId: "sess_fixture",
        sessionClaims: { iss: "https://attacker.test" },
      }),
    });
    await expect(managedCurrent(req(), env)).rejects.toThrow(
      "Invalid account identity",
    );
  });
  it("rejects revoked, expired and subject-mismatched sessions", async () => {
    for (const session of [
      { status: "revoked", userId: subject, expireAt: Date.now() + 60000 },
      { status: "active", userId: subject, expireAt: 0 },
      { status: "active", userId: "other", expireAt: Date.now() + 60000 },
    ]) {
      mock.getSession.mockResolvedValueOnce(session);
      await expect(managedCurrent(req(), env)).rejects.toThrow(
        "no longer active",
      );
    }
  });
  it("requires verified primary mailbox and honors both provider and local disable", async () => {
    const good = await mock.getUser();
    mock.getUser.mockResolvedValueOnce({ ...good, emailAddresses: [] });
    await expect(managedCurrent(req(), env)).rejects.toThrow(
      "Verify your account",
    );
    mock.getUser.mockResolvedValueOnce({ ...good, banned: true });
    await expect(managedCurrent(req(), env)).rejects.toThrow(
      "Verify your account",
    );
    const user = (await managedCurrent(req(), env))!;
    await db
      .prepare("UPDATE users SET disabled=1 WHERE id=?")
      .bind(user.id)
      .run();
    await expect(managedCurrent(req(), env)).rejects.toThrow(
      "ownership review",
    );
  });
  it("ignores legacy session cookies and prevents hosted password/mock bypasses", async () => {
    expect(
      await managedCurrent(
        new Request(origin + "/api/me", {
          headers: { cookie: "rt_session=" + "a".repeat(64) },
        }),
        env,
      ),
    ).toBeNull();
    for (const path of [
      "/auth/register",
      "/auth/login",
      "/auth/reset-password",
      "/account/password",
    ]) {
      const response = await worker.fetch(
        new Request(origin + "/api" + path, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: "{}",
        }),
        env,
      );
      expect(response.status).toBe(410);
    }
    const payment = await worker.fetch(
      new Request(origin + "/api/webhooks/kofi", { method: "POST" }),
      env,
    );
    expect(payment.status).toBe(503);
    await expect(
      managedCurrent(req(), { ...env, ENVIRONMENT: "production" }),
    ).rejects.toThrow("live Clerk");
  });
  it("isolates exports and Pro access by authenticated internal ID", async () => {
    const user = (await managedCurrent(req(), env))!;
    const exported = await worker.fetch(
      new Request(origin + "/api/account/export", req()),
      env,
    );
    expect(exported.status).toBe(200);
    expect(await exported.json()).toMatchObject({
      profile: { id: user.id },
      saved_presets: [],
    });
    expect(
      (await worker.fetch(new Request(origin + "/api/pro/presets", req()), env))
        .status,
    ).toBe(403);
    expect(
      (await worker.fetch(new Request(origin + "/api/admin", req()), env))
        .status,
    ).toBe(403);
  });
  it("requires recent reauthentication and cascades deletion with a tombstone", async () => {
    const user = (await managedCurrent(req(), env))!;
    await expect(
      deleteManaged(env, { ...user, clerk: { ...user.clerk, recent: false } }),
    ).rejects.toThrow("Sign in again");
    await db
      .prepare(
        "INSERT INTO saved_presets VALUES(? ,?,'preset','Private','{}',1)",
      )
      .bind("preset_" + subject, user.id)
      .run();
    await deleteManaged(env, user);
    expect(mock.deleteUser).toHaveBeenCalledWith(subject);
    expect(
      await db.prepare("SELECT id FROM users WHERE id=?").bind(user.id).first(),
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT id FROM saved_presets WHERE user_id=?")
        .bind(user.id)
        .first(),
    ).toBeNull();
    await expect(managedCurrent(req(), env)).rejects.toThrow("disabled");
  });
  it("fails closed during provider outages and failed deletion", async () => {
    const user = (await managedCurrent(req(), env))!;
    mock.deleteUser.mockRejectedValueOnce(Error("provider unavailable"));
    await expect(deleteManaged(env, user)).rejects.toThrow();
    await expect(managedCurrent(req(), env)).rejects.toThrow("disabled");
    mock.getSession.mockRejectedValueOnce(Error("private provider details"));
    const response = await worker.fetch(req(), env);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private provider");
  });
  it("verifies deletion webhooks and applies duplicate events idempotently", async () => {
    const user = (await managedCurrent(req(), env))!;
    const webhookEnv = {
      ...env,
      CLERK_WEBHOOK_SIGNING_SECRET: "synthetic-webhook-fixture",
    };
    mock.verifyWebhook.mockRejectedValueOnce(Error("signature"));
    await expect(managedWebhook(req(), webhookEnv)).rejects.toThrow(
      "Invalid webhook",
    );
    mock.verifyWebhook.mockResolvedValue({
      type: "user.deleted",
      data: { id: subject },
    });
    await managedWebhook(req(), webhookEnv);
    await managedWebhook(req(), webhookEnv);
    expect(
      await db.prepare("SELECT id FROM users WHERE id=?").bind(user.id).first(),
    ).toBeNull();
  });
});

it("real Clerk verifier rejects forged, expired and wrong-party signed JWTs", async () => {
  const actual =
    await vi.importActual<typeof import("@clerk/backend")>("@clerk/backend");
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const b64 = (v: Uint8Array) => Buffer.from(v).toString("base64url");
  const spki = Buffer.from(
    await crypto.subtle.exportKey("spki", keys.publicKey),
  ).toString("base64");
  const jwtKey =
    "-----BEGIN PUBLIC KEY-----\n" + spki + "\n-----END PUBLIC KEY-----";
  const sign = async (claims: object) => {
    const body =
      b64(
        new TextEncoder().encode(
          JSON.stringify({ alg: "RS256", typ: "JWT", kid: "fixture" }),
        ),
      ) +
      "." +
      b64(new TextEncoder().encode(JSON.stringify(claims)));
    return (
      body +
      "." +
      b64(
        new Uint8Array(
          await crypto.subtle.sign(
            "RSASSA-PKCS1-v1_5",
            keys.privateKey,
            new TextEncoder().encode(body),
          ),
        ),
      )
    );
  };
  const time = Math.floor(Date.now() / 1000),
    claims = {
      iss: issuer,
      sub: "user_signature",
      sid: "sess_signature",
      azp: origin,
      iat: time,
      nbf: time - 1,
      exp: time + 60,
    };
  expect(
    (
      await actual.verifyToken(await sign(claims), {
        jwtKey,
        issuer,
        authorizedParties: [origin],
      })
    ).sub,
  ).toBe("user_signature");
  for (const bad of [
    { ...claims, azp: "https://attacker.test" },
    { ...claims, exp: time - 100 },
    { ...claims, iss: "https://attacker.test" },
  ])
    await expect(
      actual.verifyToken(await sign(bad), {
        jwtKey,
        issuer,
        authorizedParties: [origin],
      }),
    ).rejects.toThrow();
  const valid = await sign(claims),
    parts = valid.split(".");
  parts[2] = "a".repeat(parts[2].length);
  await expect(
    actual.verifyToken(parts.join("."), {
      jwtKey,
      issuer,
      authorizedParties: [origin],
    }),
  ).rejects.toThrow();
});
