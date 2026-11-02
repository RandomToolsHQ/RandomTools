import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import { digest } from "../worker/security";
let mf: Miniflare, db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
const cookies: Record<string, string> = {};
let ip = 1;
async function call(
  path: string,
  actor = "owner",
  body?: unknown,
  method = body ? "POST" : "GET",
  origin = "http://localhost:5173",
) {
  return mf.dispatchFetch("http://localhost/api" + path, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      "CF-Connecting-IP": "192.0.2." + (ip++ % 240),
      ...(actor ? { cookie: cookies[actor] } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function request(actor = "owner", reason?: string) {
  const r = await call(
    "/pro-access/requests",
    actor,
    reason === undefined ? {} : { reason },
  );
  expect(r.status).toBe(201);
  return (await r.json()) as { id: string };
}
async function grant(userId = "owner", duration = "30d") {
  const r = await call("/admin/pro-access/grants", "admin", {
    userId,
    duration,
  });
  expect(r.status).toBe(200);
  return (await r.json()) as { grantId: string; expiresAt: number | null };
}
beforeAll(async () => {
  const bundled = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    format: "esm",
    write: false,
    target: "es2022",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundled.outputFiles[0].text,
      compatibilityDate: "2026-10-01",
      d1Databases: ["DB"],
      bindings: {
        APP_ORIGIN: "http://localhost:5173",
        ENVIRONMENT: "development",
        PAYMENTS_ENABLED: "true",
        KOFI_VERIFICATION_TOKEN: "synthetic-retired-key",
      },
      cf: false,
    }),
  );
  db = await mf.getD1Database("DB");
  for (const f of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("migrations/" + f, "utf8"));
}, 60000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.exec(
    "DROP TRIGGER IF EXISTS fail_manual_audit; DELETE FROM users; DELETE FROM audit_logs; DELETE FROM rate_limits;",
  );
  for (const name of ["owner", "other", "admin", "disabled", "unverified"]) {
    await db
      .prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,1)")
      .bind(
        name,
        name + "@example.test",
        name,
        "synthetic-only",
        name === "admin" ? "admin" : "free",
        name === "unverified" ? 0 : 1,
        name === "disabled" ? 1 : 0,
      )
      .run();
    const raw = crypto.randomUUID().replaceAll("-", "").repeat(2);
    cookies[name] = "rt_session=" + raw;
    await db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .bind(digest(raw), name, Math.floor(Date.now() / 1000) + 3600)
      .run();
  }
});
it("requires authentication for requests, status and administrator operations", async () => {
  for (const [path, body] of [
    ["/pro-access", undefined],
    ["/pro-access/requests", {}],
    ["/admin/pro-access", undefined],
    ["/admin/pro-access/grants", { userId: "owner", duration: "permanent" }],
  ] as const)
    expect((await call(path, "", body)).status).toBe(401);
});
it("accepts an optional reason and returns only the owner's request history", async () => {
  const a = await request("owner", "A synthetic reason");
  await request("other", "Other owner's private reason");
  const r = (await (await call("/pro-access?user_id=other")).json()) as any;
  expect(r.requests).toHaveLength(1);
  expect(r.requests[0]).toMatchObject({
    id: a.id,
    reason: "A synthetic reason",
    status: "pending",
  });
  expect(JSON.stringify(r)).not.toContain("Other owner's private reason");
  expect(r.pro).toBe(false);
  expect((await call("/pro-access/requests", "unverified", {})).status).toBe(
    409,
  );
});
it("serializes duplicate pending requests and rejects field injection", async () => {
  const responses = await Promise.all([
    call("/pro-access/requests", "owner", {}),
    call("/pro-access/requests", "owner", {}),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(
    (
      await db
        .prepare("SELECT id FROM pro_access_requests WHERE user_id='owner'")
        .all()
    ).results,
  ).toHaveLength(1);
  for (const body of [
    { reason: "x", userId: "other" },
    { reason: "x", status: "approved" },
    { reason: "x", role: "admin" },
    { reason: "x".repeat(501) },
  ])
    expect((await call("/pro-access/requests", "other", body)).status).toBe(
      400,
    );
});
it("denies approval, denial, direct grants, revocation and listing to ordinary members", async () => {
  const r = await request();
  for (const [path, body] of [
    ["/admin/pro-access", undefined],
    [
      "/admin/pro-access/requests",
      { id: r.id, decision: "approved", duration: "permanent" },
    ],
    ["/admin/pro-access/requests", { id: r.id, decision: "denied" }],
    ["/admin/pro-access/grants", { userId: "owner", duration: "7d" }],
    ["/admin/pro-access/revoke", { id: "unknown", reason: "fixture" }],
  ] as const)
    expect((await call(path, "owner", body)).status).toBe(403);
  expect(
    (await db.prepare("SELECT id FROM pro_grants").all()).results,
  ).toHaveLength(0);
});
it("approves a request and audits the decision and exact 7-day grant", async () => {
  const req = await request();
  const before = Math.floor(Date.now() / 1000);
  const r = await call("/admin/pro-access/requests", "admin", {
    id: req.id,
    decision: "approved",
    duration: "7d",
  });
  expect(r.status).toBe(200);
  const row = await db
    .prepare("SELECT * FROM pro_grants WHERE user_id='owner'")
    .first<any>();
  expect(row.expires_at - row.granted_at).toBe(7 * 86400);
  expect(row.granted_at).toBeGreaterThanOrEqual(before);
  expect(row.request_id).toBe(req.id);
  const status = (await (await call("/pro-access")).json()) as any;
  expect(status.requests[0].status).toBe("approved");
  expect(status.pro).toBe(true);
  const log = (
    await db
      .prepare("SELECT action FROM audit_logs WHERE actor_id='admin'")
      .all()
  ).results;
  expect(log).toEqual(
    expect.arrayContaining([
      { action: "pro.request.approve" },
      { action: "pro.grant:7d" },
    ]),
  );
});
it("denies a request without granting Pro and allows a new request after denial", async () => {
  const req = await request();
  expect(
    (
      await call("/admin/pro-access/requests", "admin", {
        id: req.id,
        decision: "denied",
      })
    ).status,
  ).toBe(200);
  expect((await call("/pro/preferences")).status).toBe(403);
  expect((await request()).id).not.toBe(req.id);
  const rows = (
    await db
      .prepare("SELECT status FROM pro_access_requests WHERE user_id='owner'")
      .all()
  ).results;
  expect(rows.map((r) => r.status).sort()).toEqual(["denied", "pending"]);
  expect(
    await db
      .prepare("SELECT id FROM audit_logs WHERE action='pro.request.deny'")
      .first(),
  ).not.toBeNull();
});
it("resolves simultaneous approval/denial once, without duplicate grants", async () => {
  const req = await request();
  const results = await Promise.all([
    call("/admin/pro-access/requests", "admin", {
      id: req.id,
      decision: "approved",
      duration: "30d",
    }),
    call("/admin/pro-access/requests", "admin", {
      id: req.id,
      decision: "denied",
    }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const row = await db
    .prepare("SELECT status FROM pro_access_requests WHERE id=?")
    .bind(req.id)
    .first<any>();
  const grants = (await db.prepare("SELECT id FROM pro_grants").all()).results;
  expect(grants).toHaveLength(row.status === "approved" ? 1 : 0);
  expect(
    (
      await db
        .prepare(
          "SELECT id FROM audit_logs WHERE action IN ('pro.request.approve','pro.request.deny')",
        )
        .all()
    ).results,
  ).toHaveLength(1);
});
it("grants 30-day access directly without a request and prevents a new pending request", async () => {
  const g = await grant();
  const row = await db
    .prepare("SELECT * FROM pro_grants WHERE id=?")
    .bind(g.grantId)
    .first<any>();
  expect(row.request_id).toBeNull();
  expect(row.expires_at - row.granted_at).toBe(30 * 86400);
  expect((await call("/pro-access/requests", "owner", {})).status).toBe(409);
});
it("supports explicit permanent grants and immediate revocation", async () => {
  const g = await grant("owner", "permanent");
  expect(g.expiresAt).toBeNull();
  expect((await call("/pro/preferences")).status).toBe(200);
  expect(
    (
      await call("/admin/pro-access/revoke", "admin", {
        id: g.grantId,
        reason: "Synthetic testing ended",
      })
    ).status,
  ).toBe(200);
  expect((await call("/pro/preferences")).status).toBe(403);
  expect(
    (
      await call("/admin/pro-access/revoke", "admin", {
        id: g.grantId,
        reason: "retry",
      })
    ).status,
  ).toBe(409);
  expect(
    await db
      .prepare(
        "SELECT id FROM audit_logs WHERE action='pro.grant.revoke' AND target_id=?",
      )
      .bind(g.grantId)
      .first(),
  ).not.toBeNull();
});
it("enforces expiry using server time across all server-backed Pro methods", async () => {
  await grant();
  await db
    .prepare(
      "UPDATE pro_grants SET granted_at=1,expires_at=2 WHERE user_id='owner'",
    )
    .run();
  for (const [path, method] of [
    ["preferences", "GET"],
    ["preferences", "PUT"],
    ["presets", "GET"],
    ["presets", "POST"],
    ["presets", "DELETE"],
    ["history", "GET"],
    ["history", "POST"],
    ["history", "DELETE"],
  ])
    expect(
      (
        await call(
          "/pro/" + path,
          "owner",
          method === "GET" ? undefined : {},
          method,
        )
      ).status,
    ).toBe(403);
  expect(((await (await call("/me")).json()) as any).pro).toBe(false);
});
it("replaces old grants atomically, preserves history and approves an existing pending request", async () => {
  const r = await request();
  const first = await grant("owner", "permanent"),
    second = await grant("owner", "7d");
  const rows = (
    await db.prepare("SELECT * FROM pro_grants WHERE user_id='owner'").all()
  ).results as any[];
  expect(rows).toHaveLength(2);
  expect(rows.filter((g) => g.revoked_at === null)).toHaveLength(1);
  expect(rows.find((g) => g.id === first.grantId).revocation_reason).toBe(
    "replaced",
  );
  expect(rows.find((g) => g.id === second.grantId).expires_at).not.toBeNull();
  expect(
    (
      await db
        .prepare("SELECT status FROM pro_access_requests WHERE id=?")
        .bind(r.id)
        .first<any>()
    ).status,
  ).toBe("approved");
  expect(
    await db
      .prepare(
        "SELECT id FROM audit_logs WHERE action='pro.grant.revoke:replaced' AND target_id=?",
      )
      .bind(first.grantId)
      .first(),
  ).not.toBeNull();
});
it("keeps only one current grant under concurrent direct grants", async () => {
  const rows = await Promise.all([
    call("/admin/pro-access/grants", "admin", {
      userId: "owner",
      duration: "7d",
    }),
    call("/admin/pro-access/grants", "admin", {
      userId: "owner",
      duration: "permanent",
    }),
  ]);
  expect(rows.map((r) => r.status)).toEqual([200, 200]);
  expect(
    (
      await db
        .prepare(
          "SELECT id FROM pro_grants WHERE user_id='owner' AND revoked_at IS NULL",
        )
        .all()
    ).results,
  ).toHaveLength(1);
});
it("rejects invalid durations, arbitrary expiry, role injection and invalid targets", async () => {
  for (const body of [
    { userId: "owner", duration: "forever" },
    { userId: "owner", duration: "7d", expiresAt: 99999999999 },
    { userId: "owner", duration: "permanent", role: "admin" },
  ])
    expect((await call("/admin/pro-access/grants", "admin", body)).status).toBe(
      400,
    );
  for (const userId of ["missing", "disabled", "unverified"])
    expect(
      (
        await call("/admin/pro-access/grants", "admin", {
          userId,
          duration: "permanent",
        })
      ).status,
    ).toBe(409);
  expect(
    (await call("/admin/pro-access?status=' OR 1=1 --", "admin")).status,
  ).toBe(400);
});
it("denies stale admin sessions and disabled recipients while preserving isolation", async () => {
  const g = await grant();
  await db.prepare("UPDATE users SET role='free' WHERE id='admin'").run();
  expect(
    (
      await call("/admin/pro-access/revoke", "admin", {
        id: g.grantId,
        reason: "stale",
      })
    ).status,
  ).toBe(403);
  expect((await call("/admin/pro-access", "admin")).status).toBe(403);
  expect((await call("/pro/preferences", "other")).status).toBe(403);
  await db.prepare("UPDATE users SET disabled=1 WHERE id='owner'").run();
  expect((await call("/pro/preferences")).status).toBe(401);
});
it("rolls back grants, decisions and replacement revocations if auditing fails", async () => {
  const first = await grant("owner", "7d");
  await db.exec(
    "CREATE TRIGGER fail_manual_audit BEFORE INSERT ON audit_logs WHEN NEW.action LIKE 'pro.%' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
  );
  expect(
    (
      await call("/admin/pro-access/grants", "admin", {
        userId: "owner",
        duration: "permanent",
      })
    ).status,
  ).toBe(500);
  const row = await db
    .prepare("SELECT * FROM pro_grants WHERE id=?")
    .bind(first.grantId)
    .first<any>();
  expect(row.revoked_at).toBeNull();
  expect(
    (await db.prepare("SELECT id FROM pro_grants").all()).results,
  ).toHaveLength(1);
});
it("cannot reactivate paid flows through environment flags or historical subscriptions", async () => {
  await db
    .prepare(
      "INSERT INTO subscriptions VALUES('old','owner',NULL,9999999999,'legacy-paid',1)",
    )
    .run();
  expect((await call("/pro/preferences")).status).toBe(403);
  for (const path of [
    "/admin/reconcile",
    "/admin/mock-payment",
    "/admin/subscriptions/revoke",
  ])
    expect((await call(path, "admin", {})).status).toBe(410);
  expect(
    (await call("/subscription/claim", "owner", { transactionId: "old" }))
      .status,
  ).toBe(410);
  expect(
    (
      await mf.dispatchFetch("http://localhost/api/webhooks/kofi", {
        method: "POST",
        body: "{}",
      })
    ).status,
  ).toBe(404);
  const data = (await (await call("/subscription")).json()) as any;
  expect(data.checkoutEnabled).toBe(false);
  expect(data.paymentsEnabled).toBe(false);
});
it("rolls back request review and revocation when their audit write fails", async () => {
  const pending = await request();
  await db.exec(
    "CREATE TRIGGER fail_manual_audit BEFORE INSERT ON audit_logs WHEN NEW.action LIKE 'pro.%' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
  );
  for (const body of [
    { id: pending.id, decision: "approved", duration: "30d" },
    { id: pending.id, decision: "denied" },
  ]) {
    expect(
      (await call("/admin/pro-access/requests", "admin", body)).status,
    ).toBe(500);
    expect(
      (
        await db
          .prepare("SELECT status FROM pro_access_requests WHERE id=?")
          .bind(pending.id)
          .first<any>()
      ).status,
    ).toBe("pending");
    expect(
      (await db.prepare("SELECT id FROM pro_grants").all()).results,
    ).toHaveLength(0);
  }
  await db.exec("DROP TRIGGER fail_manual_audit");
  const g = await grant("owner", "permanent");
  await db.exec(
    "CREATE TRIGGER fail_manual_audit BEFORE INSERT ON audit_logs WHEN NEW.action LIKE 'pro.%' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
  );
  expect(
    (
      await call("/admin/pro-access/revoke", "admin", {
        id: g.grantId,
        reason: "fixture",
      })
    ).status,
  ).toBe(500);
  expect((await call("/pro/preferences")).status).toBe(200);
});
it("enforces schema invariants and keeps grants valid when the granting admin is deleted", async () => {
  await expect(
    db
      .prepare(
        "INSERT INTO pro_grants(id,user_id,duration,expires_at,granted_at) VALUES('bad','owner','7d',NULL,1)",
      )
      .run(),
  ).rejects.toThrow();
  await expect(
    db
      .prepare(
        "INSERT INTO pro_grants(id,user_id,duration,expires_at,granted_at) VALUES('bad','owner','permanent',9999999999,1)",
      )
      .run(),
  ).rejects.toThrow();
  await grant("owner", "permanent");
  await db.prepare("DELETE FROM users WHERE id='admin'").run();
  expect(
    (
      await db
        .prepare("SELECT granted_by FROM pro_grants WHERE user_id='owner'")
        .first<any>()
    ).granted_by,
  ).toBeNull();
  expect((await call("/pro/preferences")).status).toBe(200);
});
it("lets admins locate an older grant by recipient beyond the default list cap", async () => {
  const original = await grant("owner", "permanent");
  await db.batch(
    Array.from({ length: 101 }, (_, i) =>
      db
        .prepare(
          "INSERT INTO pro_grants(id,user_id,duration,expires_at,granted_at,revoked_at) VALUES(?,'other','7d',9999999999,?,?)",
        )
        .bind(
          "old-history-" + i,
          Math.floor(Date.now() / 1000) + i + 1,
          Math.floor(Date.now() / 1000) + i + 2,
        ),
    ),
  );
  const all = (await (
    await call("/admin/pro-access?status=all", "admin")
  ).json()) as any;
  expect(all.grants).toHaveLength(100);
  expect(all.grants.some((g: any) => g.id === original.grantId)).toBe(false);
  const owned = (await (
    await call("/admin/pro-access?status=all&userId=owner", "admin")
  ).json()) as any;
  expect(owned.grants).toHaveLength(1);
  expect(owned.grants[0].id).toBe(original.grantId);
  const injection = (await (
    await call(
      "/admin/pro-access?userId=" + encodeURIComponent("' OR 1=1 --"),
      "admin",
    )
  ).json()) as any;
  expect(injection.grants).toHaveLength(0);
});
it("protects origin, caps request bodies and rate-limits submissions", async () => {
  expect(
    (
      await call(
        "/pro-access/requests",
        "owner",
        {},
        "POST",
        "https://attacker.test",
      )
    ).status,
  ).toBe(403);
  expect(
    (await call("/pro-access/requests", "owner", { reason: "x".repeat(5000) }))
      .status,
  ).toBe(413);
  for (let i = 0; i < 5; i++) await call("/pro-access/requests", "other", {});
  expect((await call("/pro-access/requests", "other", {})).status).toBe(429);
});
it("exports only owned manual records and cascades account data deletion", async () => {
  await request("owner", "Own reason");
  await request("other", "Other secret reason");
  await grant();
  const data = (await (await call("/account/export")).json()) as any;
  expect(data.pro_access_requests).toHaveLength(1);
  expect(data.pro_grants).toHaveLength(1);
  expect(JSON.stringify(data)).not.toContain("Other secret reason");
  await db.prepare("DELETE FROM users WHERE id='owner'").run();
  expect(
    (
      await db
        .prepare("SELECT id FROM pro_access_requests WHERE user_id='owner'")
        .all()
    ).results,
  ).toHaveLength(0);
  expect(
    (await db.prepare("SELECT id FROM pro_grants WHERE user_id='owner'").all())
      .results,
  ).toHaveLength(0);
});
