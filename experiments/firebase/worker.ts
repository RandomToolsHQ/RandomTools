import { z } from "zod";
import {
  identity,
  account,
  providerCall,
  FirebaseError,
  type FirebaseEnv,
} from "./identity";
import {
  requireStagingAccess,
  stagingGateway,
  AccessError,
  type AccessEnvironment,
} from "../../worker/access";
import {
  hasPro,
  proAccessRoute,
  ProAccessError,
} from "../../worker/pro-access";
import { digest, now, token } from "../../worker/security";
import { readBody, BodyTooLarge } from "../../worker/body";

type Env = FirebaseEnv & AccessEnvironment;
const cookieName = "__Host-rt_firebase_poc";
const cookie = (value: string, age = 1800) =>
  `${cookieName}=${value}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}`;
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers });
const input = async (req: Request) => JSON.parse(await readBody(req, 16384));
async function rate(env: Env, key: string, limit: number) {
  const ts = now();
  const result = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count",
  )
    .bind(key, ts + 60, ts, ts)
    .first<{ count: number }>();
  if (!result || result.count > limit)
    throw new FirebaseError(429, "Too many requests. Try again in one minute.");
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      response = await handle(req, env);
    } catch (error) {
      const status =
        error instanceof FirebaseError ||
        error instanceof AccessError ||
        error instanceof ProAccessError
          ? error.status
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : error instanceof BodyTooLarge
              ? 413
              : 503;
      response = json(
        {
          error:
            status === 400
              ? "Invalid request"
              : error instanceof FirebaseError ||
                  error instanceof AccessError ||
                  error instanceof ProAccessError
                ? error.message
                : "Isolated authentication service is unavailable",
        },
        status,
        status === 429
          ? { "retry-after": "60" }
          : status === 503
            ? { "retry-after": "10" }
            : {},
      );
    }
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  },
};
async function handle(req: Request, env: Env) {
  const url = new URL(req.url),
    path = url.pathname.replace(/^\/api/, "");
  if (
    env.ENVIRONMENT !== "firebase-poc" ||
    !env.APP_ORIGIN ||
    new URL(env.APP_ORIGIN).origin !== env.APP_ORIGIN ||
    !env.APP_ORIGIN.startsWith("https://")
  )
    throw new FirebaseError(503, "Isolated HTTPS proof of concept only");
  if (url.origin !== env.APP_ORIGIN)
    throw new FirebaseError(403, "Exact testing origin required");
  if (
    (await env.DB.prepare(
      "SELECT value FROM poc_metadata WHERE key='isolation'",
    ).first("value")) !== "randomtools-firebase-poc-v1"
  )
    throw new FirebaseError(
      503,
      "An isolated proof-of-concept database is required",
    );
  if (path === "/__staging" || path === "/__staging/logout")
    return stagingGateway(req, env);
  const email = await requireStagingAccess(req, env);
  if (
    req.method !== "GET" &&
    (req.headers.get("origin") !== env.APP_ORIGIN ||
      req.headers.get("content-type")?.split(";")[0] !== "application/json")
  )
    throw new FirebaseError(403, "Request origin rejected");
  if (path.startsWith("/webhooks/") || path.startsWith("/subscription"))
    return json({ error: "Payments and provider webhooks are disabled" }, 404);
  await rate(
    env,
    "poc-ip:" +
      digest(
        env.RATE_LIMIT_SECRET +
          (req.headers.get("CF-Connecting-IP") || "local"),
      ),
    90,
  );
  const auth = await identity(req, env, email),
    user = await account(env, auth);
  await rate(env, "poc-user:" + user.id, 60);
  if (path === "/session" && req.method === "POST") {
    if (now() - auth.authTime >= 300)
      throw new FirebaseError(
        403,
        "Sign in again to start an application session",
      );
    const raw = token(),
      hash = digest(raw);
    const rows = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO sessions(token_hash,user_id,expires_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM users u JOIN auth_identities a ON a.user_id=u.id WHERE u.id=? AND u.disabled=0 AND u.verified=1 AND a.issuer=? AND a.subject=? AND a.state='active') AND NOT EXISTS(SELECT 1 FROM poc_revocations WHERE issuer=? AND subject=? AND revoked_before>=?)",
      ).bind(
        hash,
        user.id,
        now() + 1800,
        user.id,
        auth.issuer,
        auth.subject,
        auth.issuer,
        auth.subject,
        auth.authTime,
      ),
      env.DB.prepare(
        "INSERT INTO poc_sessions(token_hash,auth_time) SELECT token_hash,? FROM sessions WHERE token_hash=?",
      ).bind(auth.authTime, hash),
      env.DB.prepare(
        "INSERT INTO audit_logs SELECT ?,?,'poc.session.start',?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE token_hash=?)",
      ).bind(crypto.randomUUID(), user.id, user.id, now(), hash),
    ]);
    if (!rows[0].meta.changes)
      throw new FirebaseError(401, "Sign in again after session revocation");
    return json({ message: "Private application session started" }, 200, {
      "set-cookie": cookie(raw),
    });
  }
  const cookies = (req.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(cookieName + "="));
  const raw =
    cookies.length === 1 ? cookies[0].slice(cookieName.length + 1) : "";
  const session = /^[a-f0-9]{64}$/.test(raw)
    ? await env.DB.prepare(
        "SELECT s.token_hash FROM sessions s JOIN poc_sessions p ON p.token_hash=s.token_hash WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>? AND p.auth_time=?",
      )
        .bind(digest(raw), user.id, now(), auth.authTime)
        .first()
    : null;
  if (!session)
    throw new FirebaseError(401, "Start a new private application session");
  if (path === "/me" && req.method === "GET")
    return json({
      user,
      pro: await hasPro(env, user),
      provider: "firebase",
      paymentsEnabled: false,
    });
  if (path === "/logout" && req.method === "POST") {
    // Firebase client signOut alone does not revoke a stolen ID/refresh token.
    // Invalidate all app sessions and reject old auth_time even at /session.
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO poc_revocations VALUES(?,?,?) ON CONFLICT(issuer,subject) DO UPDATE SET revoked_before=max(revoked_before,excluded.revoked_before)",
      ).bind(auth.issuer, auth.subject, now()),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
      env.DB.prepare(
        "INSERT INTO audit_logs VALUES(?,?,'poc.session.revoke-all',?,?)",
      ).bind(crypto.randomUUID(), user.id, user.id, now()),
    ]);
    return json(
      { message: "All RandomTools experiment sessions revoked" },
      200,
      { "set-cookie": cookie("", 0) },
    );
  }
  if (path === "/account" && req.method === "PATCH") {
    const body = z
      .object({ name: z.string().trim().min(1).max(80) })
      .strict()
      .parse(await input(req));
    await env.DB.prepare("UPDATE users SET name=? WHERE id=?")
      .bind(body.name, user.id)
      .run();
    return json({ message: "Profile updated" });
  }
  if (path === "/account" && req.method === "DELETE") {
    z.object({ confirmation: z.literal("DELETE") })
      .strict()
      .parse(await input(req));
    if (user.role === "admin")
      throw new FirebaseError(
        403,
        "Administrator accounts require owner-reviewed deletion",
      );
    if (now() - auth.authTime >= 300)
      throw new FirebaseError(
        403,
        "Sign in again before deleting your account",
      );
    const disabled = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO audit_logs SELECT ?,?,'poc.account.delete.requested',?,? WHERE EXISTS(SELECT 1 FROM users u JOIN auth_identities a ON a.user_id=u.id WHERE u.id=? AND u.role='free' AND u.disabled=0 AND a.issuer=? AND a.subject=? AND a.state='active')",
      ).bind(
        crypto.randomUUID(),
        user.id,
        user.id,
        now(),
        user.id,
        auth.issuer,
        auth.subject,
      ),
      env.DB.prepare(
        "UPDATE auth_identities SET state='deleting' WHERE issuer=? AND subject=? AND user_id=? AND state='active' AND EXISTS(SELECT 1 FROM users WHERE id=? AND role='free' AND disabled=0)",
      ).bind(auth.issuer, auth.subject, user.id, user.id),
      env.DB.prepare(
        "UPDATE users SET disabled=1 WHERE id=? AND role='free' AND disabled=0",
      ).bind(user.id),
      env.DB.prepare(
        "DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND role='free' AND disabled=1)",
      ).bind(user.id, user.id),
    ]);
    if (!disabled[1].meta.changes || !disabled[2].meta.changes)
      throw new FirebaseError(
        403,
        "Deletion authorization changed. Contact the test operator.",
      );
    // No privileged service credential needed: Firebase verifies the recent ID
    // token for deletion. A provider outage leaves local access disabled.
    await providerCall(env, "delete", { idToken: auth.raw });
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO audit_logs VALUES(?,?,'poc.account.delete.completed',?,?)",
      ).bind(
        "firebase_deleted_" + digest(auth.issuer + "\n" + auth.subject),
        user.id,
        user.id,
        now(),
      ),
      env.DB.prepare(
        "UPDATE auth_identities SET state='deleted' WHERE issuer=? AND subject=?",
      ).bind(auth.issuer, auth.subject),
      env.DB.prepare("DELETE FROM users WHERE id=? AND role='free'").bind(
        user.id,
      ),
    ]);
    return json({ message: "Synthetic account and owned data deleted" }, 200, {
      "set-cookie": cookie("", 0),
    });
  }
  if (path === "/account/export" && req.method === "GET") {
    const result: Record<string, unknown> = { profile: user };
    for (const table of [
      "saved_presets",
      "tool_history",
      "user_preferences",
      "pro_access_requests",
      "pro_grants",
    ])
      result[table] = (
        await env.DB.prepare(`SELECT * FROM ${table} WHERE user_id=?`)
          .bind(user.id)
          .all()
      ).results;
    return json(result);
  }
  if (path === "/pro-access/requests" && req.method === "POST")
    await rate(env, "poc-pro-request:" + user.id, 5);
  const access = await proAccessRoute(req, env, user, path);
  if (access) return access;
  if (path === "/admin" && req.method === "GET") {
    if (user.role !== "admin")
      throw new FirebaseError(403, "Administrator access required");
    return json({
      users: (
        await env.DB.prepare(
          "SELECT id,name,role,disabled FROM users ORDER BY created_at LIMIT 30",
        ).all()
      ).results,
      audit: (
        await env.DB.prepare(
          "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50",
        ).all()
      ).results,
    });
  }
  if (path.startsWith("/pro/")) {
    if (!(await hasPro(env, user)))
      throw new FirebaseError(403, "Pro access required");
    if (path === "/pro/presets") {
      if (req.method === "GET")
        return json(
          (
            await env.DB.prepare(
              "SELECT * FROM saved_presets WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
            )
              .bind(user.id)
              .all()
          ).results,
        );
      if (req.method === "POST") {
        const b = z
          .object({
            name: z.string().trim().min(1).max(80),
            data: z.record(z.string(), z.unknown()),
          })
          .strict()
          .parse(await input(req));
        const id = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO saved_presets VALUES(?,?,'preset',?,?,?)",
        )
          .bind(id, user.id, b.name, JSON.stringify(b.data), now())
          .run();
        return json({ id });
      }
      if (req.method === "DELETE") {
        const b = z
          .object({ id: z.string().max(100) })
          .strict()
          .parse(await input(req));
        await env.DB.prepare(
          "DELETE FROM saved_presets WHERE id=? AND user_id=?",
        )
          .bind(b.id, user.id)
          .run();
        return json({ message: "Removed owned preset if present" });
      }
    }
  }
  return json({ error: "Not found" }, 404);
}
