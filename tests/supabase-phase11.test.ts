import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import {
  createHandler,
  makeStore,
  makeAuthenticator,
  type Config,
} from "../experiments/supabase/core";
import { digest } from "../worker/security";
vi.setConfig({ hookTimeout: 30000 });
const ts = () => Math.floor(Date.now() / 1000),
  issued = ts() - 10;
const c: Config = {
  enabled: "phase11-synthetic-only",
  projectRef: "a".repeat(20),
  origin: "http://127.0.0.1:54381",
  accessKey: "b".repeat(64),
  firebaseProject: "randomtools-supabase-auth-poc",
  firebaseKey: "synthetic-public-key",
  rateSecret: "r".repeat(32),
  serviceKey: "synthetic-server-key",
  testers: { member: "phase11-00000000-member@example.com" },
};
let db: PGlite;
async function rpc(name: string, body: Record<string, unknown>) {
  if (name === "rt11_rate")
    return (
      await db.query<any>("SELECT public.rt11_rate($1,$2,$3) AS v", [
        body.p_key,
        body.p_limit,
        body.p_window,
      ])
    ).rows[0].v;
  if (name === "rt11_finish_delete")
    return (
      await db.query<any>("SELECT public.rt11_finish_delete($1,$2) AS v", [
        body.p_subject,
        body.p_nonce,
      ])
    ).rows[0].v;
  return (
    await db.query<any>(
      "SELECT public.rt11_request($1,$2,$3,$4,$5::jsonb) AS v",
      [
        body.p_subject,
        body.p_auth_time,
        body.p_session,
        body.p_operation,
        JSON.stringify(body.p_body),
      ],
    )
  ).rows[0].v;
}
const q = (
  who: string,
  op: string,
  body: unknown = {},
  session = digest(who),
  authTime = issued,
) =>
  rpc("rt11_request", {
    p_subject: who,
    p_auth_time: authTime,
    p_session: session,
    p_operation: op,
    p_body: body,
  });
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;",
  );
  await db.exec(await readFile("experiments/supabase/schema.sql", "utf8"));
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("TRUNCATE rt11.users CASCADE; TRUNCATE rt11.audit,rt11.rate;");
  for (const who of ["admin", "member", "other"]) {
    await db.query(
      "INSERT INTO rt11.users(id,subject,email,name,role) VALUES($1,$1,$2,$1,$3)",
      [
        who,
        `phase11-00000000-${who}@example.com`,
        who === "admin" ? "admin" : "free",
      ],
    );
    await q(who, "session");
  }
});
it("fresh profile and ordinary/admin authorization", async () => {
  expect((await q("member", "me")).pro).toBe(false);
  await expect(q("member", "admin")).rejects.toMatchObject({ code: "RT403" });
  expect((await q("admin", "admin")).users).toBe(3);
  await db.exec("UPDATE rt11.users SET role='free' WHERE id='admin'");
  await expect(q("admin", "admin")).rejects.toMatchObject({ code: "RT403" });
});
it.each(["7d", "30d", "permanent"])(
  "audited %s grant and immediate revocation",
  async (duration) => {
    const before = ts();
    await q("admin", "grant", { userId: "member", duration });
    expect((await q("member", "me")).pro).toBe(true);
    const grants = await db.query<any>("SELECT * FROM rt11.grants");
    if (duration === "permanent") expect(grants.rows[0].expires_at).toBeNull();
    else {
      const days = duration === "7d" ? 604800 : 2592000;
      expect(grants.rows[0].expires_at).toBeGreaterThanOrEqual(before + days);
      expect(grants.rows[0].expires_at).toBeLessThanOrEqual(ts() + days);
    }
    await q("admin", "revoke", { userId: "member" });
    expect((await q("member", "me")).pro).toBe(false);
    const audit = await db.query<any>("SELECT action FROM rt11.audit");
    expect(audit.rows.map((r) => r.action)).toContain("pro.grant:" + duration);
    expect(audit.rows.map((r) => r.action)).toContain("pro.revoke");
  },
);
it("expired grant cannot authorize", async () => {
  await q("admin", "grant", { userId: "member", duration: "7d" });
  await db.exec("UPDATE rt11.grants SET expires_at=0");
  await expect(q("member", "workspace")).rejects.toMatchObject({
    code: "RT403",
  });
});
it("admins can revoke a disabled member without restoring access", async () => {
  await q("admin", "grant", { userId: "member", duration: "permanent" });
  await db.exec("UPDATE rt11.users SET disabled=true WHERE id='member'");
  await expect(
    q("admin", "grant", { userId: "member", duration: "7d" }),
  ).rejects.toMatchObject({ code: "RT403" });
  await q("admin", "revoke", { userId: "member" });
  await expect(q("member", "me")).rejects.toMatchObject({ code: "RT401" });
  await db.exec("UPDATE rt11.users SET disabled=false WHERE id='member'");
  expect((await q("member", "me")).pro).toBe(false);
});
it("self promotion and owner/role injection are rejected", async () => {
  await expect(
    q("member", "grant", { userId: "member", duration: "permanent" }),
  ).rejects.toMatchObject({ code: "RT403" });
  await expect(
    q("member", "profile", { name: "Member", role: "admin" }),
  ).rejects.toMatchObject({ code: "RT400" });
  await expect(
    q("admin", "save", { name: "x", data: "x", userId: "other" }),
  ).rejects.toMatchObject({ code: "RT400" });
});
it("populated workspace, export and cross-user deletion isolation", async () => {
  await q("admin", "grant", { userId: "member", duration: "permanent" });
  await q("admin", "grant", { userId: "other", duration: "permanent" });
  const saved = await q("member", "save", {
    name: "Synthetic",
    data: "x".repeat(512),
  });
  expect((await q("member", "workspace")).presets).toHaveLength(1);
  expect((await q("other", "workspace")).presets).toHaveLength(0);
  await expect(q("other", "delete", { id: saved.id })).rejects.toMatchObject({
    code: "RT404",
  });
  expect((await q("other", "export")).presets).toHaveLength(0);
  await q("member", "delete", { id: saved.id });
  expect((await q("member", "workspace")).presets).toHaveLength(0);
});
it("concurrent writes preserve 100 preset quota", async () => {
  await db.exec(
    "INSERT INTO rt11.presets(user_id,name,data,created_at) SELECT 'admin','fixture','x',0 FROM generate_series(1,99)",
  );
  const result = await Promise.allSettled([
    q("admin", "save", { name: "one", data: "x" }),
    q("admin", "save", { name: "two", data: "x" }),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (await db.query<any>("SELECT count(*) AS n FROM rt11.presets")).rows[0].n,
  ).toBe(100);
});
it("audit failure rolls back preset mutation", async () => {
  await db.exec(
    "CREATE FUNCTION rt11.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$; CREATE TRIGGER fail BEFORE INSERT ON rt11.audit FOR EACH ROW EXECUTE FUNCTION rt11.fail_audit();",
  );
  try {
    await expect(
      q("admin", "save", { name: "never", data: "persist" }),
    ).rejects.toThrow();
  } finally {
    await db.exec(
      "DROP TRIGGER fail ON rt11.audit; DROP FUNCTION rt11.fail_audit();",
    );
  }
  expect(
    (await db.query<any>("SELECT count(*) AS n FROM rt11.presets")).rows[0].n,
  ).toBe(0);
});
it("logout invalidates independent sessions and blocks old auth_time", async () => {
  await q("member", "session", {}, "b".repeat(64));
  await q("member", "logout");
  await expect(q("member", "me", {}, "b".repeat(64))).rejects.toMatchObject({
    code: "RT401",
  });
  await expect(q("member", "session")).rejects.toMatchObject({ code: "RT401" });
});
it("expired session, disabled account and mismatched ownership deny", async () => {
  await expect(q("other", "me", {}, "b".repeat(64))).rejects.toMatchObject({
    code: "RT401",
  });
  await db.exec("UPDATE rt11.sessions SET expires_at=0 WHERE user_id='member'");
  await expect(q("member", "me")).rejects.toMatchObject({ code: "RT401" });
  await db.exec("UPDATE rt11.users SET disabled=true WHERE id='other'");
  await expect(q("other", "me")).rejects.toMatchObject({ code: "RT401" });
});
it("deletion tombstones, cascades, denies access and records provider confirmation", async () => {
  await q("member", "delete-begin");
  await expect(q("member", "me")).rejects.toMatchObject({ code: "RT401" });
  expect(
    await rpc("rt11_finish_delete", {
      p_subject: "member",
      p_nonce: digest("member"),
    }),
  ).toBe(true);
  await expect(
    rpc("rt11_finish_delete", {
      p_subject: "member",
      p_nonce: digest("member"),
    }),
  ).rejects.toMatchObject({ code: "RT403" });
  await q("other", "delete-begin"); // independent tombstone emails do not collide
  await expect(q("admin", "delete-begin")).rejects.toMatchObject({
    code: "RT403",
  });
});
it("RLS and privilege boundary deny browser and runtime direct tables", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec("SET ROLE " + role);
    try {
      await expect(db.query("SELECT * FROM rt11.users")).rejects.toThrow();
      if (role !== "service_role")
        await expect(q("member", "me")).rejects.toThrow();
    } finally {
      await db.exec("RESET ROLE");
    }
  }
});
it("atomic rate limit persists rejected attempts", async () => {
  const result = await Promise.all(
    Array.from({ length: 22 }, () =>
      rpc("rt11_rate", { p_key: "synthetic", p_limit: 20, p_window: 10 }),
    ),
  );
  expect(result.filter(Boolean)).toHaveLength(20);
});
const auth = {
  subject: "member",
  issuer: "https://securetoken.google.com/randomtools-supabase-auth-poc",
  authTime: issued,
  email: c.testers.member,
  name: "Synthetic",
  raw: "synthetic",
};
const req = (
  input: unknown = { operation: "me" },
  headers: Record<string, string> = {},
) =>
  new Request(
    "https://" + c.projectRef + ".supabase.co/functions/v1/randomtools-phase11",
    {
      method: "POST",
      headers: {
        origin: c.origin,
        "content-type": "application/json",
        "x-poc-access": c.accessKey,
        cookie: "__Host-rt_phase11=" + "c".repeat(64),
        ...headers,
      },
      body: typeof input === "string" ? input : JSON.stringify(input),
    },
  );
it.each([
  ["origin", "https://evil.example", 403],
  ["x-poc-access", "wrong", 403],
  ["content-type", "text/plain", 415],
])("HTTP rejects %s before provider", async (key, value, status) => {
  const verify = vi.fn();
  const handler = createHandler(c, { rpc }, verify);
  expect(
    (await handler(req(undefined, { [String(key)]: String(value) }))).status,
  ).toBe(status);
  expect(verify).not.toHaveBeenCalled();
});
it.each([
  ["{", 400],
  ["x".repeat(17000), 413],
  [{ operation: "me", role: "admin" }, 400],
])("malformed or oversized request fails closed", async (body, status) => {
  const verify = vi.fn();
  expect((await createHandler(c, { rpc }, verify)(req(body))).status).toBe(
    status,
  );
  expect(verify).not.toHaveBeenCalled();
});
it("HTTP session cookie is secure and bound; database errors sanitized", async () => {
  const handler = createHandler(c, { rpc }, async () => auth);
  const r = await handler(req({ operation: "session" }));
  expect(r.status).toBe(200);
  expect(r.headers.get("set-cookie")).toMatch(
    /Secure; HttpOnly; SameSite=Strict/,
  );
  const broken = createHandler(
    c,
    {
      rpc: async () => {
        throw Error("private sql password");
      },
    },
    async () => auth,
  );
  const fail = await broken(req());
  expect(fail.status).toBe(503);
  expect(await fail.text()).not.toContain("private");
});
it("transport timeout, SQL error and provider outage cannot authorize", async () => {
  await expect(
    makeStore(c, vi.fn().mockRejectedValue(new Error("timeout"))).rpc(
      "rt11_request",
      {},
    ),
  ).rejects.toMatchObject({ status: 503 });
  await expect(
    makeStore(
      c,
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ code: "XX000", message: "secret" }, { status: 500 }),
        ),
    ).rpc("rt11_request", {}),
  ).rejects.toMatchObject({ status: 503 });
  const h = createHandler(c, { rpc }, async () => {
    throw Error("provider unavailable");
  });
  expect((await h(req())).status).toBe(503);
});
it("deletion provider failure leaves an inaccessible durable tombstone", async () => {
  await db.query("INSERT INTO rt11.sessions VALUES($1,$2,$3,$4)", [
    digest("c".repeat(64)),
    "member",
    auth.authTime,
    ts() + 1800,
  ]);
  const h = createHandler(
    c,
    { rpc },
    async () => auth,
    async () => {
      throw Error("provider timeout");
    },
  );
  expect(
    (
      await h(
        req({ operation: "account-delete", body: { confirmation: "DELETE" } }),
      )
    ).status,
  ).toBe(503);
  await expect(q("member", "me")).rejects.toMatchObject({ code: "RT401" });
  expect(
    (
      await db.query<any>(
        "SELECT action FROM rt11.audit WHERE action='account.delete-pending-provider'",
      )
    ).rows,
  ).toHaveLength(1);
});
it("missing/unknown token and existing Firebase project are rejected", async () => {
  await expect(makeAuthenticator(c)(req())).rejects.toMatchObject({
    status: 401,
  });
  expect(
    (
      await createHandler(
        { ...c, firebaseProject: "randomtools-firebase-poc" },
        { rpc },
        async () => auth,
      )(req())
    ).status,
  ).toBe(503);
});
