import { beforeAll, afterAll, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { bootstrapStatements } from "../scripts/admin-bootstrap-sql";
import { hasPro } from "../worker/pro-access";
let mf: Miniflare, db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script:
        "export default {fetch(){return new Response('local synthetic bootstrap test')}}",
      compatibilityDate: "2026-10-01",
      d1Databases: ["DB"],
      cf: false,
    }),
  );
  db = await mf.getD1Database("DB");
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
}, 60000);
afterAll(async () => {
  await mf.dispose();
});
it("atomically promotes the exact verified Clerk identity, audits once and refuses replay", async () => {
  const p = {
      subject: "user_syntheticfounder",
      issuer: "https://quiet-civet-8782.clerk.accounts.dev",
      userId: "clerk_" + "a".repeat(64),
      operationId: "founder_bootstrap_" + "b".repeat(32),
    },
    s = bootstrapStatements(p);
  await db
    .prepare(
      "INSERT INTO users VALUES(?, 'founder@example.test','Synthetic Founder','managed:clerk','free',1,0,1)",
    )
    .bind(p.userId)
    .run();
  await db
    .prepare("INSERT INTO auth_identities VALUES(?,?,?,'active',1)")
    .bind(p.issuer, p.subject, p.userId)
    .run();
  await db.exec(s.create);
  const r = await db
    .prepare(s.update)
    .bind(...s.params)
    .all();
  expect(r.results).toEqual([{ id: p.userId, role: "admin" }]);
  expect(await hasPro({ DB: db } as any, { id: p.userId, role: "admin" })).toBe(
    true,
  );
  expect(
    await db
      .prepare("SELECT action,actor_id,target_id FROM audit_logs WHERE id=?")
      .bind(p.operationId)
      .first(),
  ).toEqual({
    action: "admin.bootstrap.founder",
    actor_id: p.userId,
    target_id: p.userId,
  });
  expect(
    (
      await db
        .prepare(s.update)
        .bind(...s.params)
        .all()
    ).results,
  ).toHaveLength(0);
  await db.exec(s.drop);
  expect(
    (
      await db
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
        .all()
    ).results,
  ).toHaveLength(0);
});
it("fails closed on identity mismatch and rolls back promotion if auditing fails", async () => {
  await db.exec("DELETE FROM users; DELETE FROM audit_logs;");
  const p = {
      subject: "user_expected",
      issuer: "https://quiet-civet-8782.clerk.accounts.dev",
      userId: "clerk_" + "c".repeat(64),
      operationId: "founder_bootstrap_" + "d".repeat(32),
    },
    s = bootstrapStatements(p);
  await db
    .prepare(
      "INSERT INTO users VALUES(?, 'other@example.test','Synthetic','managed:clerk','free',1,0,1)",
    )
    .bind(p.userId)
    .run();
  await db
    .prepare("INSERT INTO auth_identities VALUES(?, 'user_wrong',?,'active',1)")
    .bind(p.issuer, p.userId)
    .run();
  await db.exec(s.create);
  expect(
    (
      await db
        .prepare(s.update)
        .bind(...s.params)
        .all()
    ).results,
  ).toHaveLength(0);
  await db
    .prepare("UPDATE auth_identities SET subject=? WHERE user_id=?")
    .bind(p.subject, p.userId)
    .run();
  await db.exec(
    "CREATE TRIGGER reject_bootstrap_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
  );
  await expect(
    db
      .prepare(s.update)
      .bind(...s.params)
      .all(),
  ).rejects.toThrow();
  expect(
    (
      await db
        .prepare("SELECT role FROM users WHERE id=?")
        .bind(p.userId)
        .first()
    )?.role,
  ).toBe("free");
  await db.exec("DROP TRIGGER reject_bootstrap_audit;");
  await db.exec(s.drop);
});
