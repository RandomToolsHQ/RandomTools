import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import {
  createHandler,
  makeAuthenticator,
  makeStore,
  type Config,
  Denied,
} from "../poc/supabase/supabase/functions/randomtools-poc/core";

const provider = vi.hoisted(() => ({
  verify: vi.fn(),
  session: vi.fn(),
  user: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    authenticateRequest: provider.verify,
    sessions: { getSession: provider.session },
    users: { getUser: provider.user },
  }),
}));
const issuer = "https://synthetic.clerk.accounts.dev";
const config: Config = {
  enabled: "true",
  projectRef: "a".repeat(20),
  supabaseUrl: `https://${"a".repeat(20)}.supabase.co`,
  serviceKey: "synthetic-service-key",
  accessKey: "a".repeat(64),
  origin: "http://127.0.0.1:54380",
  clerkSecret: "sk_test_synthetic",
  clerkPublic: "pk_test_synthetic",
  clerkIssuer: issuer,
  testers: { user_alice: "alice@example.com", user_bob: "bob@example.com" },
};
let db: PGlite;
async function query(subject: string, operation: string, body = {}) {
  const result = await db.query<{ result: unknown }>(
    "SELECT public.rt_poc_request($1,$2,$3,$4::jsonb) AS result",
    [issuer, subject, operation, JSON.stringify(body)],
  );
  return result.rows[0].result as any;
}
async function seed() {
  await db.exec(
    "TRUNCATE rt_poc.users CASCADE; TRUNCATE rt_poc.audit_logs,rt_poc.rate_limits;",
  );
  for (const id of ["alice", "bob", "admin"]) {
    await db.query(
      "INSERT INTO rt_poc.users VALUES($1,$2,$1,'CLERK_ONLY',$3,1,0,0)",
      [id, `${id}@example.com`, id === "admin" ? "admin" : "free"],
    );
    await db.query(
      "INSERT INTO rt_poc.auth_identities VALUES($1,$2,$3,'active',0)",
      [issuer, `user_${id}`, id],
    );
    await db.query(
      "INSERT INTO rt_poc.subscriptions VALUES($1,$2,NULL,$3,'poc-synthetic',0)",
      [`sub_${id}`, id, Math.floor(Date.now() / 1000) + 3600],
    );
  }
  await db.exec(`INSERT INTO rt_poc.saved_presets SELECT 'alice_'||i,'alice','preset','Synthetic '||i,repeat('x',2048),i FROM generate_series(1,10) i;
    INSERT INTO rt_poc.tool_history SELECT 'history_'||i,'alice','json',repeat('y',1024),i FROM generate_series(1,10) i;
    INSERT INTO rt_poc.saved_presets VALUES('bob_only','bob','preset','Bob synthetic','private',0);`);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;",
  );
  for (const name of ["202611020001_schema.sql", "202611020002_api.sql"])
    await db.exec(
      await readFile(`poc/supabase/supabase/migrations/${name}`, "utf8"),
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await seed();
  provider.verify.mockReset().mockResolvedValue({
    isAuthenticated: true,
    toAuth: () => ({
      userId: "user_alice",
      sessionId: "sess_alice",
      sessionClaims: { iss: issuer, azp: config.origin },
    }),
  });
  provider.session.mockReset().mockResolvedValue({
    status: "active",
    userId: "user_alice",
    expireAt: Date.now() + 60000,
  });
  provider.user.mockReset().mockResolvedValue({
    banned: false,
    locked: false,
    primaryEmailAddressId: "email_synthetic",
    emailAddresses: [
      {
        id: "email_synthetic",
        emailAddress: "alice@example.com",
        verification: { status: "verified" },
      },
    ],
  });
});
describe("isolated Postgres POC authorization", () => {
  it("preserves mailbox uniqueness and immutable identity tombstones", async () => {
    await expect(
      db.query(
        "INSERT INTO rt_poc.users VALUES('collision','alice@example.com','fixture','CLERK_ONLY','free',1,0,0)",
      ),
    ).rejects.toThrow(/unique constraint/);
    await db.exec("DELETE FROM rt_poc.users WHERE id='alice'");
    const mapping = await db.query<{ user_id: null }>(
      "SELECT user_id FROM rt_poc.auth_identities WHERE subject='user_alice'",
    );
    expect(mapping.rows[0].user_id).toBeNull();
    await expect(query("user_alice", "me")).rejects.toThrow("Denied");
    await expect(
      db.query(
        "INSERT INTO rt_poc.auth_identities VALUES($1,'user_alice','bob','active',0)",
        [issuer],
      ),
    ).rejects.toThrow(/unique constraint/);
  });
  it("restores a local Postgres snapshot with data, RPCs and client denials", async () => {
    const snapshot = await db.dumpDataDir();
    const restored = new PGlite({ loadDataDir: snapshot });
    try {
      expect(
        (await restored.query("SELECT * FROM rt_poc.saved_presets")).rows,
      ).toHaveLength(11);
      const me = await restored.query<{ result: { id: string } }>(
        "SELECT public.rt_poc_request($1,'user_alice','me') AS result",
        [issuer],
      );
      expect(me.rows[0].result.id).toBe("alice");
      await restored.exec("SET ROLE authenticated");
      await expect(
        restored.query(
          "SELECT public.rt_poc_request($1,'user_alice','admin')",
          [issuer],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        restored.query("SELECT * FROM rt_poc.saved_presets"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await restored.close();
    }
  }, 30000);
  it("ports all 15 tables with RLS and denies browser roles", async () => {
    const tables = await db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='rt_poc' AND c.relkind='r'",
    );
    expect(tables.rows).toHaveLength(15);
    expect(tables.rows.every((t) => t.relrowsecurity)).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(db.query("SELECT * FROM rt_poc.users")).rejects.toThrow(
          /permission denied/,
        );
        await expect(query("user_alice", "admin")).rejects.toThrow(
          /permission denied/,
        );
        await expect(db.query("SELECT public.rt_poc_rate()")).rejects.toThrow(
          /permission denied/,
        );
      } finally {
        await db.exec("RESET ROLE");
      }
    }
  });
  it("reads a populated workspace without leaking another owner's records", async () => {
    const result = await query("user_alice", "workspace");
    expect(result.presets).toHaveLength(10);
    expect(result.history).toHaveLength(10);
    expect(result.presets.every((p: any) => p.id.startsWith("alice_"))).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toContain("bob_only");
  });
  it("writes and audits atomically; owner can delete, another owner cannot", async () => {
    const { id } = await query("user_alice", "save", {
      name: "Synthetic",
      data: "fixture",
    });
    await expect(query("user_bob", "delete", { id })).rejects.toThrow(
      "Not found",
    );
    expect((await query("user_alice", "delete", { id })).deleted).toBe(true);
    const a = await db.query(
      "SELECT * FROM rt_poc.audit_logs WHERE target_id=$1",
      [id],
    );
    expect(a.rows).toHaveLength(2);
  });
  it("rolls back the write if audit insertion fails", async () => {
    await db.exec(
      "ALTER TABLE rt_poc.audit_logs ADD CONSTRAINT reject_fixture CHECK(action<>'poc.preset.create')",
    );
    await expect(
      query("user_alice", "save", { name: "rollback", data: "fixture" }),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "SELECT * FROM rt_poc.saved_presets WHERE name='rollback'",
        )
      ).rows,
    ).toHaveLength(0);
    await db.exec(
      "ALTER TABLE rt_poc.audit_logs DROP CONSTRAINT reject_fixture",
    );
  });
  it("applies expiry and subscription removal immediately", async () => {
    await db.exec(
      "UPDATE rt_poc.subscriptions SET paid_through=0 WHERE user_id='alice'",
    );
    expect((await query("user_alice", "me")).pro).toBe(false);
    await expect(query("user_alice", "workspace")).rejects.toThrow("Denied");
    await db.exec("DELETE FROM rt_poc.subscriptions WHERE user_id='bob'");
    await expect(
      query("user_bob", "save", { name: "denied", data: "x" }),
    ).rejects.toThrow("Denied");
  });
  it("checks current admin role and records admin reads", async () => {
    await expect(
      query("user_alice", "admin", { role: "admin" }),
    ).rejects.toThrow("Denied");
    expect((await query("user_admin", "admin")).users).toBe(3);
    await db.exec("UPDATE rt_poc.users SET role='free' WHERE id='admin'");
    await expect(query("user_admin", "admin")).rejects.toThrow("Denied");
    expect(
      (
        await db.query(
          "SELECT * FROM rt_poc.audit_logs WHERE action='poc.admin.read'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("rejects disabled users and identity tombstones without provisioning", async () => {
    await db.exec(
      "UPDATE rt_poc.users SET disabled=1 WHERE id='alice'; UPDATE rt_poc.auth_identities SET state='deleted' WHERE user_id='bob'",
    );
    await expect(query("user_alice", "me")).rejects.toThrow("Denied");
    await expect(query("user_bob", "me")).rejects.toThrow("Denied");
    await expect(query("user_unknown", "me")).rejects.toThrow("Denied");
  });
  it("rejects role/owner injection and validates size and quota", async () => {
    for (const body of [
      { name: "x", data: "x", user_id: "bob" },
      { name: "x", data: "x", role: "admin" },
      { name: "x", data: "x".repeat(4097) },
    ])
      await expect(query("user_alice", "save", body)).rejects.toThrow(
        "Invalid body",
      );
    await db.exec(
      "INSERT INTO rt_poc.saved_presets SELECT 'extra_'||i,'alice','preset','extra','x',0 FROM generate_series(1,90) i",
    );
    await expect(
      query("user_alice", "save", { name: "over", data: "x" }),
    ).rejects.toThrow("Quota");
  });
  it("has an atomic distributed provider budget", async () => {
    for (let i = 0; i < 20; i++)
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "SELECT public.rt_poc_rate() allowed",
          )
        ).rows[0].allowed,
      ).toBe(true);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT public.rt_poc_rate() allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
});
describe("POC gateway and live Clerk checks (provider fixtures, not hosted proof)", () => {
  const request = (
    extra: Record<string, string> = {},
    body: unknown = { operation: "me" },
  ) =>
    new Request("https://poc.invalid/functions/v1/randomtools-poc", {
      method: "POST",
      headers: {
        origin: config.origin,
        "x-poc-access": config.accessKey,
        authorization: "Bearer fixture",
        "content-type": "application/json",
        ...extra,
      },
      body: JSON.stringify(body),
    });
  const store = {
    rate: vi.fn(async () => true),
    request: vi.fn(async () => ({ ok: true })),
  };
  it("requires the prototype gate before any Clerk work", async () => {
    const auth = vi.fn(makeAuthenticator(config));
    const handle = createHandler(config, store, auth);
    expect((await handle(request({ "x-poc-access": "wrong" }))).status).toBe(
      403,
    );
    expect(
      (await handle(request({ origin: "https://attacker.invalid" }))).status,
    ).toBe(403);
    expect(auth).not.toHaveBeenCalled();
  });
  it("fails closed when disabled or a real mailbox is configured", async () => {
    for (const c of [
      { ...config, enabled: "false" },
      { ...config, testers: { user_alice: "real@gmail.com" } },
    ])
      expect(
        (await createHandler(c, store, makeAuthenticator(config))(request()))
          .status,
      ).toBe(503);
  });
  it("does not cache session or profile decisions", async () => {
    const auth = makeAuthenticator(config);
    await auth(request());
    await auth(request());
    expect(provider.verify).toHaveBeenCalledTimes(2);
    expect(provider.session).toHaveBeenCalledTimes(2);
    expect(provider.user).toHaveBeenCalledTimes(2);
    provider.session.mockResolvedValue({
      status: "revoked",
      userId: "user_alice",
      expireAt: Date.now() + 60000,
    });
    await expect(auth(request())).rejects.toMatchObject({ status: 401 });
  });
  it("rejects JWT denial, wrong issuer and authorized party", async () => {
    for (const state of [
      { isAuthenticated: false },
      {
        isAuthenticated: true,
        toAuth: () => ({
          userId: "user_alice",
          sessionId: "s",
          sessionClaims: { iss: "wrong", azp: config.origin },
        }),
      },
      {
        isAuthenticated: true,
        toAuth: () => ({
          userId: "user_alice",
          sessionId: "s",
          sessionClaims: { iss: issuer, azp: "https://wrong.invalid" },
        }),
      },
    ]) {
      provider.verify.mockResolvedValue(state);
      await expect(makeAuthenticator(config)(request())).rejects.toMatchObject({
        status: 401,
      });
    }
  });
  it("rejects expired/mismatched sessions, locked users and unverified mailboxes", async () => {
    const auth = makeAuthenticator(config);
    for (const session of [
      { status: "active", userId: "user_alice", expireAt: 0 },
      { status: "active", userId: "user_other", expireAt: Date.now() + 60000 },
    ]) {
      provider.session.mockResolvedValue(session);
      await expect(auth(request())).rejects.toMatchObject({ status: 401 });
    }
    provider.session.mockResolvedValue({
      status: "active",
      userId: "user_alice",
      expireAt: Date.now() + 60000,
    });
    provider.user.mockResolvedValue({ locked: true, emailAddresses: [] });
    await expect(auth(request())).rejects.toMatchObject({ status: 403 });
    provider.user.mockResolvedValue({
      primaryEmailAddressId: "e",
      emailAddresses: [
        {
          id: "e",
          emailAddress: "alice@example.com",
          verification: { status: "unverified" },
        },
      ],
    });
    await expect(auth(request())).rejects.toMatchObject({ status: 403 });
  });
  it("redacts provider failures and distinguishes Clerk throttling", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      provider.session.mockRejectedValue({
        status: 429,
        message: "secret fixture",
      });
      const r = await createHandler(
        config,
        store,
        makeAuthenticator(config),
      )(request());
      expect(r.status).toBe(503);
      expect(r.headers.get("retry-after")).toBe("10");
      expect(await r.text()).not.toContain("secret");
      expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    } finally {
      log.mockRestore();
    }
  });
  it("bounds streamed bodies and rejects operation injection", async () => {
    const handle = createHandler(config, store, makeAuthenticator(config));
    expect(
      (await handle(request({}, { operation: "me", subject: "user_admin" })))
        .status,
    ).toBe(400);
    expect(
      (
        await handle(
          request({}, { operation: "save", body: { data: "x".repeat(17000) } }),
        )
      ).status,
    ).toBe(413);
  });
  it("maps only explicit SQL denials; all other failures stay unavailable", async () => {
    for (const [code, status] of [
      ["RT403", 403],
      ["RT404", 404],
      ["RT400", 400],
      ["42501", 503],
    ] as const) {
      const store = makeStore(
        config,
        vi.fn(async () =>
          Response.json({ code, message: "private sql" }, { status: 400 }),
        ),
      );
      await expect(
        store.request({ issuer, subject: "user_alice" }, "me", {}),
      ).rejects.toMatchObject({ status });
    }
    expect(new Denied(403).message).toBe("Request denied");
  });
});
