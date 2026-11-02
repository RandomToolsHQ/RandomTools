import { z } from "zod";
import { readBody } from "./body";
import { now } from "./security";

type Env = { DB: D1Database };
type User = { id: string; role: string };
export class ProAccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const reject = (status: number, message: string): never => {
  throw new ProAccessError(status, message);
};
const json = (body: unknown, status = 200) => Response.json(body, { status });
const duration = z.enum(["7d", "30d", "permanent"]);
const identifier = z.string().min(1).max(100);
const input = async (req: Request) => JSON.parse(await readBody(req, 4096));

export async function hasPro(env: Env, user: User) {
  // Fresh database state for every decision. Historical paid subscriptions do
  // not authorize access on the free-first roadmap. NULL explicitly means permanent.
  return !!(await env.DB.prepare(
    "SELECT u.id FROM users u WHERE u.id=? AND u.disabled=0 AND u.verified=1 AND (u.role='admin' OR EXISTS(SELECT 1 FROM pro_grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?)))",
  )
    .bind(user.id, now())
    .first());
}
export async function accessStatus(env: Env, user: User) {
  const rows = await env.DB.batch([
    env.DB.prepare(
      "SELECT id,reason,status,created_at,decided_at FROM pro_access_requests WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20",
    ).bind(user.id),
    env.DB.prepare(
      "SELECT id,duration,expires_at,granted_at,revoked_at FROM pro_grants WHERE user_id=? ORDER BY granted_at DESC,rowid DESC LIMIT 20",
    ).bind(user.id),
  ]);
  return {
    pro: await hasPro(env, user),
    requests: rows[0].results,
    grants: rows[1].results,
    paymentsEnabled: false,
    checkoutEnabled: false,
  };
}
// Rechecked inside every administrative transaction, in addition to current()
// reading fresh local role state and Clerk's live session/profile verification.
const permitted =
  "EXISTS(SELECT 1 FROM users a JOIN users t ON t.id=? WHERE a.id=? AND a.role='admin' AND a.disabled=0 AND a.verified=1 AND t.disabled=0 AND t.verified=1)";

async function grant(
  env: Env,
  actor: User,
  userId: string,
  term: z.infer<typeof duration>,
  requestId?: string,
) {
  const ts = now(),
    operation = crypto.randomUUID();
  const expires =
    term === "permanent" ? null : ts + (term === "7d" ? 7 : 30) * 86400;
  const params = [userId, actor.id];
  const requestFilter = requestId ? " AND id=?" : "";
  const condition =
    permitted +
    (requestId
      ? " AND EXISTS(SELECT 1 FROM pro_access_requests WHERE id=? AND decision_id=? AND status='approved')"
      : "");
  const guards = requestId ? [...params, requestId, operation] : params;
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE pro_access_requests SET status='approved',decided_at=?,decided_by=?,decision_id=? WHERE user_id=? AND status='pending'${requestFilter} AND ${permitted}`,
    ).bind(
      ts,
      actor.id,
      operation,
      userId,
      ...(requestId ? [requestId] : []),
      ...params,
    ),
    env.DB.prepare(
      `UPDATE pro_grants SET revoked_at=?,revoked_by=?,revoke_operation=?,revocation_reason='replaced' WHERE user_id=? AND revoked_at IS NULL AND ${condition}`,
    ).bind(ts, actor.id, operation, userId, ...guards),
    env.DB.prepare(
      `INSERT INTO pro_grants(id,user_id,duration,expires_at,granted_at,granted_by,request_id) SELECT ?,?,?,?,?,?,(SELECT id FROM pro_access_requests WHERE decision_id=?) WHERE ${condition}`,
    ).bind(
      operation,
      userId,
      term,
      expires,
      ts,
      actor.id,
      operation,
      ...guards,
    ),
    env.DB.prepare(
      "INSERT INTO audit_logs SELECT ?,?,'pro.request.approve',id,? FROM pro_access_requests WHERE decision_id=?",
    ).bind(crypto.randomUUID(), actor.id, ts, operation),
    env.DB.prepare(
      "INSERT INTO audit_logs SELECT lower(hex(randomblob(16))),?,'pro.grant.revoke:replaced',id,? FROM pro_grants WHERE revoke_operation=?",
    ).bind(actor.id, ts, operation),
    env.DB.prepare(
      "INSERT INTO audit_logs SELECT ?,?,?,id,? FROM pro_grants WHERE id=?",
    ).bind(crypto.randomUUID(), actor.id, "pro.grant:" + term, ts, operation),
  ]);
  if (!result[2].meta.changes)
    reject(409, "Request or account changed. Refresh before trying again.");
  return json({
    message: requestId
      ? "Request approved. Pro access granted."
      : "Pro access granted.",
    grantId: operation,
    expiresAt: expires,
  });
}

export async function proAccessRoute(
  req: Request,
  env: Env,
  user: User,
  path: string,
): Promise<Response | undefined> {
  if (path === "/pro-access" && req.method === "GET")
    return json(await accessStatus(env, user));
  if (path === "/pro-access/requests" && req.method === "POST") {
    const b = z
      .object({ reason: z.string().trim().max(500).optional().default("") })
      .strict()
      .parse(await input(req));
    const id = crypto.randomUUID(),
      ts = now();
    // INSERT SELECT + partial UNIQUE index serializes simultaneous submissions.
    const result = await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO pro_access_requests(id,user_id,reason,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND role<>'admin' AND disabled=0 AND verified=1) AND NOT EXISTS(SELECT 1 FROM pro_access_requests WHERE user_id=? AND status='pending') AND NOT EXISTS(SELECT 1 FROM pro_grants WHERE user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?))",
      ).bind(id, user.id, b.reason, ts, user.id, user.id, user.id, ts),
      env.DB.prepare(
        "INSERT INTO audit_logs SELECT ?,?,'pro.request.submit',id,? FROM pro_access_requests WHERE id=?",
      ).bind(crypto.randomUUID(), user.id, ts, id),
    ]);
    if (!result[0].meta.changes)
      reject(
        409,
        "You already have Pro access or a pending request. Refresh your status.",
      );
    return json(
      { message: "Pro access requested. An administrator will review it.", id },
      201,
    );
  }
  if (!path.startsWith("/admin/pro-access")) return;
  if (
    user.role !== "admin" ||
    !(await env.DB.prepare(
      "SELECT id FROM users WHERE id=? AND role='admin' AND disabled=0 AND verified=1",
    )
      .bind(user.id)
      .first())
  )
    reject(403, "Administrator access required");
  if (path === "/admin/pro-access" && req.method === "GET") {
    const status = z
      .enum(["all", "pending", "approved", "denied"])
      .parse(new URL(req.url).searchParams.get("status") || "pending");
    const userId = z
      .string()
      .max(100)
      .parse(new URL(req.url).searchParams.get("userId") || "");
    // Query parameters never select another account's permissions or executable SQL.
    const rows = await env.DB.batch([
      env.DB.prepare(
        "SELECT r.*,u.name,u.email,u.disabled FROM pro_access_requests r JOIN users u ON u.id=r.user_id WHERE (?='all' OR r.status=?) ORDER BY (r.status='pending') DESC,r.created_at DESC,r.rowid DESC LIMIT 100",
      ).bind(status, status),
      env.DB.prepare(
        "SELECT g.*,u.name,u.email,u.role,u.disabled FROM pro_grants g JOIN users u ON u.id=g.user_id WHERE (?='' OR g.user_id=?) ORDER BY g.granted_at DESC,g.rowid DESC LIMIT 100",
      ).bind(userId, userId),
    ]);
    return json({ requests: rows[0].results, grants: rows[1].results });
  }
  if (path === "/admin/pro-access/grants" && req.method === "POST") {
    const b = z
      .object({ userId: identifier, duration })
      .strict()
      .parse(await input(req));
    return grant(env, user, b.userId, b.duration);
  }
  if (path === "/admin/pro-access/requests" && req.method === "POST") {
    const b = z
      .discriminatedUnion("decision", [
        z
          .object({ id: identifier, decision: z.literal("approved"), duration })
          .strict(),
        z.object({ id: identifier, decision: z.literal("denied") }).strict(),
      ])
      .parse(await input(req));
    const request = await env.DB.prepare(
      "SELECT user_id FROM pro_access_requests WHERE id=? AND status='pending'",
    )
      .bind(b.id)
      .first<{ user_id: string }>();
    if (!request)
      reject(
        409,
        "This request was already reviewed or is no longer available.",
      );
    if (b.decision === "approved")
      return grant(env, user, request!.user_id, b.duration, b.id);
    const op = crypto.randomUUID(),
      ts = now();
    const rows = await env.DB.batch([
      env.DB.prepare(
        "UPDATE pro_access_requests SET status='denied',decided_at=?,decided_by=?,decision_id=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND disabled=0 AND verified=1)",
      ).bind(ts, user.id, op, b.id, user.id),
      env.DB.prepare(
        "INSERT INTO audit_logs SELECT ?,?,'pro.request.deny',id,? FROM pro_access_requests WHERE decision_id=?",
      ).bind(crypto.randomUUID(), user.id, ts, op),
    ]);
    if (!rows[0].meta.changes)
      reject(
        409,
        "Request or administrator access changed. Refresh before trying again.",
      );
    return json({ message: "Pro access request denied." });
  }
  if (path === "/admin/pro-access/revoke" && req.method === "POST") {
    const b = z
      .object({ id: identifier, reason: z.string().trim().min(1).max(200) })
      .strict()
      .parse(await input(req));
    const op = crypto.randomUUID(),
      ts = now();
    const rows = await env.DB.batch([
      env.DB.prepare(
        "UPDATE pro_grants SET revoked_at=?,revoked_by=?,revoke_operation=?,revocation_reason=? WHERE id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND disabled=0 AND verified=1)",
      ).bind(ts, user.id, op, b.reason, b.id, user.id),
      env.DB.prepare(
        "INSERT INTO audit_logs SELECT ?,?,'pro.grant.revoke',id,? FROM pro_grants WHERE revoke_operation=?",
      ).bind(crypto.randomUUID(), user.id, ts, op),
    ]);
    if (!rows[0].meta.changes)
      reject(409, "Grant was already revoked or is no longer available.");
    return json({
      message:
        "Pro grant revoked. Access is checked again on the next request.",
    });
  }
  reject(404, "Not found");
}
