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
import {
  managedCurrent,
  deleteManaged,
  managedWebhook,
  clerkClient,
} from "../worker/clerk";
import { createClerkClient } from "@clerk/backend";
import worker from "../worker/index";
const mock = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  verifyWebhook: vi.fn(),
  requireStagingAccess: vi.fn(),
}));
vi.mock("../worker/access", async (original) => ({
  ...(await original<any>()),
  requireStagingAccess: mock.requireStagingAccess,
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
it("reuses only SDK machinery, replaces it on credential rotation and keeps the production guard", () => {
  const config = { ...env, CLERK_ISSUER: issuer + "/" + subject };
  const first = clerkClient(config);
  expect(clerkClient(config)).toBe(first);
  expect(createClerkClient).toHaveBeenCalledTimes(1);
  expect(
    clerkClient({
      ...config,
      CLERK_SECRET_KEY: config.CLERK_SECRET_KEY + "rotated",
    }),
  ).not.toBe(first);
  expect(createClerkClient).toHaveBeenCalledTimes(2);
  expect(() => clerkClient({ ...config, ENVIRONMENT: "production" })).toThrow(
    "Production authentication requires live Clerk configuration",
  );
});
it("rechecks provider state on each request and fails closed with a safe retry hint on throttling", async () => {
  await managedCurrent(req(), env);
  await managedCurrent(req(), env);
  expect(mock.getSession).toHaveBeenCalledTimes(2);
  expect(mock.getUser).toHaveBeenCalledTimes(2);
  mock.getSession.mockRejectedValueOnce({
    status: 429,
    message: "private provider details",
  });
  const response = await worker.fetch(req(), env);
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("10");
  expect(await response.text()).not.toContain("private provider details");
  expect(mock.getUser).toHaveBeenCalledTimes(2);
  mock.getSession.mockResolvedValueOnce({
    status: "revoked",
    userId: subject,
    expireAt: Date.now() + 60000,
  });
  expect((await worker.fetch(req(), env)).status).toBe(401);
});
it("rejects a gateway identity mismatch before provisioning any D1 account", async () => {
  await expect(
    managedCurrent(req(), env, "different@example.test"),
  ).rejects.toMatchObject({ status: 403 });
  const identity = await db
    .prepare("SELECT user_id FROM auth_identities WHERE issuer=? AND subject=?")
    .bind(issuer, subject)
    .first();
  expect(identity).toBeNull();
});
it("keeps production closed independently of provider configuration and rejects mixed development keys", async () => {
  const closed = await worker.fetch(req(), {
    ...env,
    ENVIRONMENT: "production",
  });
  expect(closed.status).toBe(503);
  expect(await closed.text()).toContain(
    "Public accounts have not been enabled",
  );
  for (const overrides of [
    {
      CLERK_SECRET_KEY: "sk_live_fixture",
      CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
    },
    {
      CLERK_SECRET_KEY: "sk_live_fixture",
      CLERK_PUBLISHABLE_KEY: "pk_live_fixture",
    },
  ])
    expect(() =>
      clerkClient({ ...env, ...overrides, ENVIRONMENT: "production" }),
    ).toThrow("live Clerk");
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
  mock.requireStagingAccess.mockResolvedValue(subject + "@example.test");
  env = {
    DB: db,
    APP_ORIGIN: origin,
    ENVIRONMENT: "staging",
    AUTH_PROVIDER: "clerk",
    CLERK_TESTER_IDS: JSON.stringify([subject]),
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
  it("checks every Pro storage verb, paid-through expiry and cross-user ownership", async () => {
    const user = (await managedCurrent(req(), env))!;
    const call = (path: string, method = "GET", body?: unknown) =>
      worker.fetch(
        new Request(origin + "/api" + path, {
          method,
          headers: {
            authorization: "Bearer synthetic-fixture",
            origin,
            "content-type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        env,
      );
    const verbs = [
      ["preferences", "GET"],
      ["preferences", "PUT"],
      ["presets", "GET"],
      ["presets", "POST"],
      ["presets", "DELETE"],
      ["history", "GET"],
      ["history", "POST"],
      ["history", "DELETE"],
    ];
    for (const [path, method] of verbs)
      expect(
        (await call("/pro/" + path, method, method === "GET" ? undefined : {}))
          .status,
      ).toBe(403);
    await db
      .prepare(
        "INSERT INTO pro_grants(id,user_id,duration,expires_at,granted_at) VALUES(?,?,'7d',?,1)",
      )
      .bind("sub_" + subject, user.id, Math.floor(Date.now() / 1000) + 3600)
      .run();
    expect(
      (
        await call("/pro/presets", "POST", {
          kind: "workflow",
          name: "Mine",
          data: { steps: ["trim", "lower"] },
          user_id: "victim",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("/pro/preferences", "PUT", {
          data: { favourites: ["json"] },
          retentionDays: 7,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("/pro/history", "POST", { tool: "case", data: "private" }))
        .status,
    ).toBe(200);
    const own = (await (await call("/pro/presets")).json()) as any[];
    expect(own).toHaveLength(1);
    expect(own[0].user_id).toBe(user.id);
    const victim = "victim_" + subject;
    await db
      .prepare(
        "INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,'Victim','managed:clerk',1)",
      )
      .bind(victim, victim + "@example.test")
      .run();
    await db
      .prepare("INSERT INTO saved_presets VALUES(?,?,'preset','Victim','{}',1)")
      .bind(victim, victim)
      .run();
    await call("/pro/presets", "DELETE", { id: victim });
    expect(
      await db
        .prepare("SELECT id FROM saved_presets WHERE id=?")
        .bind(victim)
        .first(),
    ).not.toBeNull();
    expect(
      JSON.stringify(
        await (await call("/account/export?user_id=" + victim)).json(),
      ),
    ).not.toContain('"name":"Victim"');
    expect(
      (await call("/pro/preferences", "PUT", { data: {}, retentionDays: 0 }))
        .status,
    ).toBe(200);
    await call("/pro/history", "POST", { tool: "case", data: "do not retain" });
    expect(await (await call("/pro/history")).json()).toEqual([]);
    await db
      .prepare("UPDATE pro_grants SET expires_at=2 WHERE user_id=?")
      .bind(user.id)
      .run();
    for (const [path, method] of verbs)
      expect(
        (await call("/pro/" + path, method, method === "GET" ? undefined : {}))
          .status,
      ).toBe(403);
  }, 30000);
  it("rejects privilege injection, gates every admin mutation and audits authorized changes", async () => {
    const user = (await managedCurrent(req(), env))!;
    const call = (
      path: string,
      body?: unknown,
      method = body ? "POST" : "GET",
    ) =>
      worker.fetch(
        new Request(origin + "/api" + path, {
          method,
          headers: {
            authorization: "Bearer synthetic-fixture",
            origin,
            "content-type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
        env,
      );
    await call(
      "/account",
      { name: "Still free", role: "admin", pro: true },
      "PATCH",
    );
    expect((await managedCurrent(req(), env))!.role).toBe("free");
    for (const path of [
      "/admin",
      "/admin/users",
      "/admin/tools",
      "/admin/reconcile",
      "/admin/subscriptions/revoke",
      "/admin/mock-payment",
    ])
      expect(
        (await call(path, path === "/admin" ? undefined : { role: "admin" }))
          .status,
      ).toBe(403);
    await db
      .prepare("UPDATE users SET role='admin' WHERE id=?")
      .bind(user.id)
      .run();
    expect((await call("/admin?search=' OR 1=1 --")).status).toBe(200);
    expect(
      (await call("/admin/users", { id: user.id, disabled: true })).status,
    ).toBe(400);
    expect((await call("/admin/mock-payment", {})).status).toBe(410);
    const target = "admin_target_" + subject;
    await db
      .prepare(
        "INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,'Target','managed:clerk',1)",
      )
      .bind(target, target + "@example.test")
      .run();
    expect(
      (await call("/admin/users", { id: target, disabled: true })).status,
    ).toBe(200);
    expect(
      await db
        .prepare("SELECT disabled,role FROM users WHERE id=?")
        .bind(target)
        .first(),
    ).toMatchObject({ disabled: 1, role: "free" });
    expect(
      (await call("/admin/users", { id: target, disabled: false })).status,
    ).toBe(200);
    expect(
      await db
        .prepare("SELECT disabled FROM users WHERE id=?")
        .bind(target)
        .first(),
    ).toMatchObject({ disabled: 0 });
    expect(
      (await call("/admin/users", { id: "missing", disabled: true })).status,
    ).toBe(404);
    expect(
      (
        await call("/admin/subscriptions/revoke", {
          id: "missing",
          reason: "manual",
        })
      ).status,
    ).toBe(410);
    expect(
      (await call("/admin/tools", { tool: "missing", enabled: false })).status,
    ).toBe(400);
    expect(
      await db
        .prepare(
          "SELECT actor_id FROM audit_logs WHERE actor_id=? AND target_id='missing'",
        )
        .bind(user.id)
        .first(),
    ).toBeNull();
    expect(
      (await call("/admin/tools", { tool: "json", enabled: false })).status,
    ).toBe(200);
    expect(
      await db
        .prepare(
          "SELECT actor_id FROM audit_logs WHERE actor_id=? AND action='tool.availability:false'",
        )
        .bind(user.id)
        .first(),
    ).not.toBeNull();
    await call("/admin/tools", { tool: "json", enabled: true });
  }, 30000);
  it("denies staging testers not explicitly allowlisted before data provisioning", async () => {
    await expect(
      managedCurrent(req(), { ...env, CLERK_TESTER_IDS: "[]" }),
    ).rejects.toThrow("not authorized");
    expect(mock.getSession).not.toHaveBeenCalled();
    expect(mock.getUser).not.toHaveBeenCalled();
    expect(
      await db
        .prepare("SELECT user_id FROM auth_identities WHERE subject=?")
        .bind(subject)
        .first(),
    ).toBeNull();
  });
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
    expect(payment.status).toBe(404);
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
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider");
  });
  it("protects administrators from self-deletion and other-admin disable without changing data", async () => {
    const user = (await managedCurrent(req(), env))!;
    await db
      .prepare("UPDATE users SET role='admin' WHERE id=?")
      .bind(user.id)
      .run();
    // An old in-memory free user cannot bypass the fresh deletion role check.
    await expect(deleteManaged(env, user)).rejects.toThrow("owner-reviewed");
    expect(mock.deleteUser).not.toHaveBeenCalled();
    const call = (path: string, body: object, method = "POST") =>
      worker.fetch(
        new Request(origin + "/api" + path, {
          method,
          headers: {
            authorization: "Bearer synthetic-fixture",
            origin,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
        env,
      );
    expect(
      (await call("/account", { confirmation: "DELETE" }, "DELETE")).status,
    ).toBe(403);
    const second = "admin_" + subject;
    await db
      .prepare(
        "INSERT INTO users(id,email,name,password_hash,role,verified,created_at) VALUES(?,?,'Protected admin','managed:clerk','admin',1,1)",
      )
      .bind(second, second + "@example.test")
      .run();
    expect(
      (await call("/admin/users", { id: second, disabled: true })).status,
    ).toBe(403);
    expect(
      await db
        .prepare("SELECT role,disabled FROM users WHERE id=?")
        .bind(second)
        .first(),
    ).toEqual({ role: "admin", disabled: 0 });
    expect(
      await db
        .prepare("SELECT state FROM auth_identities WHERE subject=?")
        .bind(subject)
        .first("state"),
    ).toBe("active");
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE actor_id=? AND action LIKE 'account.delete.%'",
        )
        .bind(user.id)
        .first("n"),
    ).toBe(0);
  });
  it("cleans every owned workspace/access row, retains an atomic completion audit and treats provider 404 as deleted", async () => {
    const user = (await managedCurrent(req(), env))!;
    await db.batch([
      db
        .prepare("INSERT INTO sessions VALUES(?,?,9999999999)")
        .bind(subject, user.id),
      db
        .prepare("INSERT INTO email_verification_tokens VALUES(?,?,9999999999)")
        .bind(subject, user.id),
      db
        .prepare("INSERT INTO password_reset_tokens VALUES(?,?,9999999999)")
        .bind(subject, user.id),
      db
        .prepare("INSERT INTO user_preferences(user_id) VALUES(?)")
        .bind(user.id),
      db
        .prepare(
          "INSERT INTO saved_presets VALUES(?,?,'preset','Synthetic','{}',1)",
        )
        .bind(subject, user.id),
      db
        .prepare("INSERT INTO tool_history VALUES(?,?,'case','synthetic',1)")
        .bind(subject, user.id),
      db
        .prepare(
          "INSERT INTO server_favourites(user_id,server_id,created_at) VALUES(?,'hypixel',1)",
        )
        .bind(user.id),
      db
        .prepare(
          "INSERT INTO pro_access_requests(id,user_id,created_at) VALUES(?,?,1)",
        )
        .bind(subject, user.id),
      db
        .prepare(
          "INSERT INTO pro_grants(id,user_id,duration,granted_at) VALUES(?,?,'permanent',1)",
        )
        .bind(subject, user.id),
    ]);
    mock.deleteUser.mockRejectedValueOnce({ status: 404 });
    await deleteManaged(env, user);
    for (const table of [
      "sessions",
      "email_verification_tokens",
      "password_reset_tokens",
      "user_preferences",
      "saved_presets",
      "tool_history",
      "server_favourites",
      "pro_access_requests",
      "pro_grants",
    ])
      expect(
        await db
          .prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id=?`)
          .bind(user.id)
          .first("n"),
      ).toBe(0);
    expect(
      await db
        .prepare("SELECT state,user_id FROM auth_identities WHERE subject=?")
        .bind(subject)
        .first(),
    ).toEqual({ state: "deleted", user_id: null });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE target_id=? AND action='account.delete.completed'",
        )
        .bind(user.id)
        .first("n"),
    ).toBe(1);
  });
  it("rolls back deletion state if the start audit cannot be written", async () => {
    const user = (await managedCurrent(req(), env))!;
    await db.exec(
      "CREATE TRIGGER reject_delete_audit BEFORE INSERT ON audit_logs WHEN NEW.action='account.delete.requested' BEGIN SELECT RAISE(ABORT,'synthetic audit outage'); END;",
    );
    try {
      await expect(deleteManaged(env, user)).rejects.toThrow();
      expect(mock.deleteUser).not.toHaveBeenCalled();
      expect(
        await db
          .prepare("SELECT state FROM auth_identities WHERE subject=?")
          .bind(subject)
          .first("state"),
      ).toBe("active");
      expect(
        await db
          .prepare("SELECT disabled FROM users WHERE id=?")
          .bind(user.id)
          .first("disabled"),
      ).toBe(0);
    } finally {
      await db.exec("DROP TRIGGER reject_delete_audit;");
    }
  });
  it("persists unknown deletion tombstones and completion audits idempotently", async () => {
    const webhookEnv = {
      ...env,
      CLERK_WEBHOOK_SIGNING_SECRET: "synthetic-webhook-fixture",
    };
    mock.verifyWebhook.mockResolvedValue({
      type: "user.deleted",
      data: { id: subject },
    });
    await managedWebhook(req(), webhookEnv);
    await managedWebhook(req(), webhookEnv);
    await expect(managedCurrent(req(), env)).rejects.toThrow("disabled");
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM auth_identities WHERE subject=? AND state='deleted' AND user_id IS NULL",
        )
        .bind(subject)
        .first("n"),
    ).toBe(1);
  });
  it("recovers a provider-deleted account through signed delivery after completion-audit failure", async () => {
    const user = (await managedCurrent(req(), env))!;
    await db.exec(
      "CREATE TRIGGER reject_completion_audit BEFORE INSERT ON audit_logs WHEN NEW.action='account.delete.completed' BEGIN SELECT RAISE(ABORT,'synthetic completion audit outage'); END;",
    );
    try {
      await expect(deleteManaged(env, user)).rejects.toThrow();
      expect(mock.deleteUser).toHaveBeenCalledWith(subject);
      expect(
        await db
          .prepare("SELECT disabled FROM users WHERE id=?")
          .bind(user.id)
          .first("disabled"),
      ).toBe(1);
      expect(
        await db
          .prepare("SELECT state FROM auth_identities WHERE subject=?")
          .bind(subject)
          .first("state"),
      ).toBe("deleting");
    } finally {
      await db.exec("DROP TRIGGER reject_completion_audit;");
    }
    mock.verifyWebhook.mockResolvedValue({
      type: "user.deleted",
      data: { id: subject },
    });
    const webhookEnv = {
      ...env,
      CLERK_WEBHOOK_SIGNING_SECRET: "synthetic-webhook-fixture",
    };
    await managedWebhook(req(), webhookEnv);
    await managedWebhook(req(), webhookEnv);
    expect(
      await db.prepare("SELECT id FROM users WHERE id=?").bind(user.id).first(),
    ).toBeNull();
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE target_id=? AND action='account.delete.completed'",
        )
        .bind(user.id)
        .first("n"),
    ).toBe(1);
  });
  it("keeps signed deletion delivery available with public accounts closed but rejects production development keys", async () => {
    const live = {
      ...env,
      ENVIRONMENT: "production",
      CLERK_SECRET_KEY: "sk_live_synthetic",
      CLERK_PUBLISHABLE_KEY: "pk_live_synthetic",
      CLERK_ISSUER: "https://clerk.synthetic.example",
      CLERK_WEBHOOK_SIGNING_SECRET: "synthetic-webhook-fixture",
    };
    mock.authenticateRequest.mockResolvedValueOnce({
      isAuthenticated: true,
      toAuth: () => ({
        userId: subject,
        sessionId: "sess_fixture",
        sessionClaims: { iss: live.CLERK_ISSUER, azp: origin, fva: [0, -1] },
      }),
    });
    const user = (await managedCurrent(req(), live))!;
    mock.verifyWebhook.mockResolvedValue({
      type: "user.deleted",
      data: { id: subject },
    });
    const hook = () =>
      new Request(origin + "/api/webhooks/clerk", {
        method: "POST",
        body: "{}",
      });
    expect(
      (
        await worker.fetch(hook(), {
          ...env,
          ENVIRONMENT: "production",
          CLERK_WEBHOOK_SIGNING_SECRET: "synthetic-webhook-fixture",
        })
      ).status,
    ).toBe(503);
    expect(mock.verifyWebhook).not.toHaveBeenCalled();
    expect((await worker.fetch(hook(), live)).status).toBe(200);
    expect(
      await db.prepare("SELECT id FROM users WHERE id=?").bind(user.id).first(),
    ).toBeNull();
    expect((await worker.fetch(req(), live)).status).toBe(503);
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
