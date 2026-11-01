import {
  managedCurrent,
  managedWebhook,
  deleteManaged,
  clerkClient,
  AuthError,
  type ClerkEnvironment,
  type ManagedUser,
} from "./clerk";
import { z } from "zod";
import {
  AccessError,
  requireStagingAccess,
  type AccessEnvironment,
} from "./access";
import { tools, pricing } from "../src/catalog";
import { deliverEmail, emailMode, type EmailEnvironment } from "./email";
import { readBody, BodyTooLarge } from "./body";
import {
  digest,
  equal,
  hashPassword,
  now,
  token,
  verifyPassword,
} from "./security";
interface Env extends EmailEnvironment, ClerkEnvironment, AccessEnvironment {
  DB: D1Database;
  APP_ORIGIN: string;
  ENVIRONMENT: string;
  PAYMENTS_ENABLED: string;
  KOFI_VERIFICATION_TOKEN?: string;
  RATE_LIMIT_SECRET?: string;
}
type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  verified: number;
  disabled: number;
  password_hash: string;
};
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
});
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
const safeUser = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  verified: !!u.verified,
});
async function parse(req: Request) {
  return JSON.parse(await readBody(req, 262144));
}
async function rate(env: Env, key: string, limit = 10) {
  await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?")
    .bind(now())
    .run();
  const r = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(key, now() + 900)
    .first<{ count: number }>();
  if ((r?.count || 0) > limit)
    fail(429, "Too many attempts. Please try again in 15 minutes.");
}
async function current(req: Request, env: Env, accessEmail?: string) {
  if (env.AUTH_PROVIDER === "clerk")
    return managedCurrent(req, env, accessEmail);
  const cookie = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)rt_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!cookie) return null;
  return env.DB.prepare(
    "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0",
  )
    .bind(digest(cookie), now())
    .first<User>();
}
async function pro(env: Env, user: User) {
  return (
    user.role === "admin" ||
    !!(await env.DB.prepare(
      "SELECT id FROM subscriptions WHERE user_id=? AND paid_through>? LIMIT 1",
    )
      .bind(user.id, now())
      .first())
  );
}
async function audit(env: Env, actor: string, action: string, target: string) {
  await env.DB.prepare("INSERT INTO audit_logs VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), actor, action, target, now())
    .run();
}
function cookie(value: string, env: Env, age = 604800) {
  return `rt_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${["production", "staging"].includes(env.ENVIRONMENT) ? "; Secure" : ""}`;
}
async function issue(
  env: Env,
  user: User,
  kind: "verify" | "reset",
  ctx?: ExecutionContext,
) {
  const raw = token();
  const table =
    kind === "verify" ? "email_verification_tokens" : "password_reset_tokens";
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`INSERT INTO ${table} VALUES(?,?,?)`).bind(
      digest(raw),
      user.id,
      now() + (kind === "verify" ? 86400 : 1800),
    ),
  ]);
  const link = `${env.APP_ORIGIN}/${kind === "verify" ? "verify-email" : "reset-password"}?token=${raw}`;
  if (emailMode(env) === "development")
    return {
      developmentLink: link,
      delivery: "development-only; no email sent",
    };
  const delivery = deliverEmail(env, user.email, kind, link, digest(raw)).catch(
    async () => {
      await env.DB.prepare(`DELETE FROM ${table} WHERE token_hash=?`)
        .bind(digest(raw))
        .run();
      await audit(env, user.id, "email.delivery.failed", user.id);
    },
  );
  if (ctx) ctx.waitUntil(delivery);
  else await delivery;
  return {};
}
async function webhook(req: Request, env: Env) {
  if (env.PAYMENTS_ENABLED !== "true" || !env.KOFI_VERIFICATION_TOKEN)
    fail(503, "Live payments are disabled");
  if (
    req.headers.get("content-type")?.split(";")[0].trim() !==
    "application/x-www-form-urlencoded"
  )
    fail(415, "Expected a form-encoded webhook");
  const text = await readBody(req, 32768);
  const data = JSON.parse(new URLSearchParams(text).get("data") || "{}");
  const event = z
    .object({
      verification_token: z.string(),
      message_id: z.string().min(1).max(100),
      kofi_transaction_id: z.string().min(1).max(100),
      type: z.string().max(50),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
      currency: z.string().length(3),
      is_subscription_payment: z.boolean(),
    })
    .parse(data);
  if (!equal(event.verification_token, env.KOFI_VERIFICATION_TOKEN!))
    fail(401, "Invalid webhook");
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO payment_events(id,transaction_id,event_type,amount,currency,member,received_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(
      event.message_id,
      event.kofi_transaction_id,
      event.type,
      event.amount,
      event.currency,
      event.is_subscription_payment ? 1 : 0,
      now(),
    )
    .run();
  return json({ received: true, duplicate: result.meta.changes === 0 });
}
async function handle(req: Request, env: Env, ctx?: ExecutionContext) {
  const url = new URL(req.url),
    path = url.pathname.replace(/^\/api/, "");
  if (
    !env.APP_ORIGIN ||
    !["development", "production", "staging", "test"].includes(env.ENVIRONMENT)
  )
    fail(503, "Invalid server configuration");
  const appOrigin = z.url().safeParse(env.APP_ORIGIN);
  if (!appOrigin.success || new URL(env.APP_ORIGIN).origin !== env.APP_ORIGIN)
    fail(503, "APP_ORIGIN must be an exact origin");
  if (
    ["production", "staging"].includes(env.ENVIRONMENT) &&
    (!env.RATE_LIMIT_SECRET ||
      env.RATE_LIMIT_SECRET.length < 32 ||
      !/^https:\/\/[^/]+$/.test(env.APP_ORIGIN))
  )
    fail(503, "Production security configuration is incomplete");
  if (path === "/webhooks/clerk" && req.method === "POST") {
    await readBody(req.clone(), 65536);
    return managedWebhook(req, env);
  }
  const accessEmail =
    env.ENVIRONMENT === "staging"
      ? await requireStagingAccess(req, env)
      : undefined;
  if (path === "/webhooks/kofi" && req.method === "POST")
    return webhook(req, env);
  if (!["GET", "HEAD"].includes(req.method)) {
    if (
      req.headers.get("origin") !== env.APP_ORIGIN ||
      req.headers.get("content-type")?.split(";")[0].trim() !==
        "application/json"
    )
      fail(403, "Request origin rejected");
  }
  if (
    ["production", "staging"].includes(env.ENVIRONMENT) &&
    env.AUTH_PROVIDER !== "clerk"
  )
    fail(503, "Managed authentication is required on hosting");
  if (
    env.AUTH_PROVIDER === "clerk" &&
    ((path.startsWith("/auth/") && path !== "/auth/logout") ||
      path === "/account/password")
  )
    fail(410, "Use the secure Clerk account controls");
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  if (path.startsWith("/auth/"))
    await rate(
      env,
      `auth:${digest((env.RATE_LIMIT_SECRET || "development") + ip)}`,
      25,
    );
  const user = await current(req, env, accessEmail);
  if (path === "/usage" && req.method === "POST") {
    const b = z
      .object({ tool: z.string() })
      .strict()
      .parse(await parse(req));
    if (!tools.some((t) => t.id === b.tool)) fail(400, "Unknown tool");
    await rate(
      env,
      "usage:" + digest((env.RATE_LIMIT_SECRET || "local") + ip),
      100,
    );
    await env.DB.prepare(
      "INSERT INTO usage_daily VALUES(?,?,1) ON CONFLICT(day,tool) DO UPDATE SET count=count+1",
    )
      .bind(new Date().toISOString().slice(0, 10), b.tool)
      .run();
    return json({ recorded: true });
  }
  if (path === "/me" && req.method === "GET")
    return json({
      user: user ? safeUser(user) : null,
      pro: user ? await pro(env, user) : false,
    });
  if (path === "/tools" && req.method === "GET")
    return json({
      availability: (
        await env.DB.prepare("SELECT * FROM tool_availability").all()
      ).results,
    });
  if (path === "/auth/register" && req.method === "POST") {
    if (emailMode(env) === "disabled")
      fail(503, "Email delivery is not configured. Contact support.");
    const b = credentials
      .extend({ name: z.string().trim().min(1).max(80) })
      .parse(await parse(req));
    await rate(env, "register:" + digest(b.email), 3);
    const id = crypto.randomUUID();
    const hash = await hashPassword(b.password);
    const exists = await env.DB.prepare("SELECT * FROM users WHERE email=?")
      .bind(b.email)
      .first<User>();
    const registrationMessage =
      "If eligible, verification instructions will be delivered. Check your inbox or request a new link.";
    if (exists)
      return json(
        {
          message: registrationMessage,
          ...(!exists.verified && !exists.disabled
            ? await issue(env, exists, "verify", ctx)
            : {}),
        },
        201,
      );
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)",
    )
      .bind(id, b.email, b.name, hash, now())
      .run();
    const u = await env.DB.prepare("SELECT * FROM users WHERE email=?")
      .bind(b.email)
      .first<User>();
    return json(
      {
        message: registrationMessage,
        ...(!u!.verified && !u!.disabled
          ? await issue(env, u!, "verify", ctx)
          : {}),
      },
      201,
    );
  }
  if (path === "/auth/login" && req.method === "POST") {
    const b = credentials.parse(await parse(req));
    await rate(env, "login:" + digest(b.email));
    const u = await env.DB.prepare("SELECT * FROM users WHERE email=?")
      .bind(b.email)
      .first<User>();
    const dummy =
      "pbkdf2-sha256$600000$" + "0".repeat(64) + "$" + "0".repeat(64);
    const valid = await verifyPassword(b.password, u?.password_hash || dummy);
    if (!u || !valid || !u.verified || u.disabled)
      throw new HttpError(
        401,
        "Unable to sign in. Check your details and verify your email.",
      );
    const raw = token();
    await env.DB.prepare("INSERT INTO sessions VALUES(?,?,?)")
      .bind(digest(raw), u.id, now() + 604800)
      .run();
    return json({ user: safeUser(u) }, 200, { "Set-Cookie": cookie(raw, env) });
  }
  if (
    (path === "/auth/forgot-password" ||
      path === "/auth/resend-verification") &&
    req.method === "POST"
  ) {
    if (emailMode(env) === "disabled")
      fail(503, "Email delivery is not configured. Contact support.");
    const { email } = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
      })
      .parse(await parse(req));
    await rate(env, "email:" + digest(email), 3);
    const u = await env.DB.prepare("SELECT * FROM users WHERE email=?")
      .bind(email)
      .first<User>();
    return json({
      message:
        "If eligible, instructions will be delivered. Check your inbox and spam folder.",
      ...(u && !u.disabled && (path.endsWith("forgot-password") || !u.verified)
        ? await issue(
            env,
            u,
            path.endsWith("forgot-password") ? "reset" : "verify",
            ctx,
          )
        : {}),
    });
  }
  if (
    (path === "/auth/verify-email" || path === "/auth/reset-password") &&
    req.method === "POST"
  ) {
    const reset = path.endsWith("reset-password");
    const b = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: z.string().min(12).max(128),
      })
      .parse(await parse(req));
    const table = reset ? "password_reset_tokens" : "email_verification_tokens";
    // The mailbox owner chooses the final password. A pre-verification
    // registrant must never retain credentials after someone else activates.
    const hash = await hashPassword(b.password);
    const rawHash = digest(b.token),
      time = now();
    const validUser = `SELECT user_id FROM ${table} WHERE token_hash=? AND expires_at>?`;
    const results = await env.DB.batch([
      reset
        ? env.DB.prepare(
            `UPDATE users SET password_hash=? WHERE id=(${validUser})`,
          ).bind(hash, rawHash, time)
        : env.DB.prepare(
            `UPDATE users SET verified=1,password_hash=? WHERE id=(${validUser})`,
          ).bind(hash, rawHash, time),
      env.DB.prepare(`DELETE FROM sessions WHERE user_id=(${validUser})`).bind(
        rawHash,
        time,
      ),
      env.DB.prepare(
        `DELETE FROM ${table} WHERE token_hash=? AND expires_at>? RETURNING user_id`,
      ).bind(rawHash, time),
    ]);
    if (!results[2].results.length) fail(400, "Link is invalid or expired");
    return json({
      message: reset
        ? "Password changed. Sign in with your new password."
        : "Email verified. You can sign in.",
    });
  }
  if (!user) fail(401, "Sign in to continue");
  const u = user!;
  if (path === "/auth/logout" && req.method === "POST") {
    if (env.AUTH_PROVIDER === "clerk") {
      await clerkClient(env).sessions.revokeSession(
        (u as ManagedUser).clerk.sessionId,
      );
      return json({ message: "Signed out" });
    }
    const raw =
      req.headers.get("cookie")?.match(/rt_session=([a-f0-9]{64})/)?.[1] || "";
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(digest(raw))
      .run();
    return json({ message: "Signed out" }, 200, {
      "Set-Cookie": cookie("", env, 0),
    });
  }
  if (path === "/account" && req.method === "PATCH") {
    const b = z
      .object({ name: z.string().trim().min(1).max(80) })
      .strict()
      .parse(await parse(req));
    await env.DB.prepare("UPDATE users SET name=? WHERE id=?")
      .bind(b.name, u.id)
      .run();
    return json({ message: "Profile updated" });
  }
  if (path === "/account/password" && req.method === "POST") {
    const b = z
      .object({
        currentPassword: z.string().max(128),
        password: z.string().min(12).max(128),
      })
      .parse(await parse(req));
    await rate(env, "password:" + u.id, 5);
    if (!(await verifyPassword(b.currentPassword, u.password_hash)))
      fail(400, "Current password is incorrect");
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(
        await hashPassword(b.password),
        u.id,
      ),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(u.id),
    ]);
    return json({ message: "Password changed. All sessions revoked." }, 200, {
      "Set-Cookie": cookie("", env, 0),
    });
  }
  if (path === "/account" && req.method === "DELETE") {
    if (env.AUTH_PROVIDER === "clerk") {
      const body = z
        .object({ confirmation: z.literal("DELETE") })
        .strict()
        .parse(await parse(req));
      if (body.confirmation !== "DELETE") fail(400, "Confirm deletion");
      await audit(env, u.id, "account.delete.requested", u.id);
      await deleteManaged(env, u as ManagedUser);
      return json({ message: "Account and saved data deleted" });
    }
    const b = z
      .object({ password: z.string().max(128) })
      .parse(await parse(req));
    await rate(env, "delete:" + u.id, 5);
    if (!(await verifyPassword(b.password, u.password_hash)))
      fail(400, "Password is incorrect");
    await audit(env, u.id, "account.delete", u.id);
    await env.DB.prepare("DELETE FROM users WHERE id=?").bind(u.id).run();
    return json({ message: "Account deleted" }, 200, {
      "Set-Cookie": cookie("", env, 0),
    });
  }
  if (path === "/account/export" && req.method === "GET") {
    const tables = [
      "user_preferences",
      "saved_presets",
      "tool_history",
      "subscriptions",
      "membership_claims",
      "payment_events",
    ];
    const data: Record<string, unknown> = { profile: safeUser(u) };
    if (env.AUTH_PROVIDER === "clerk") {
      const identity = (u as ManagedUser).clerk;
      data.authentication = {
        provider: "clerk",
        issuer: identity.issuer,
        subject: identity.subject,
      };
    }
    for (const t of tables)
      data[t] = (
        await env.DB.prepare(`SELECT * FROM ${t} WHERE user_id=?`)
          .bind(u.id)
          .all()
      ).results;
    return json(data);
  }
  if (path === "/subscription" && req.method === "GET")
    return json({
      pro: await pro(env, u),
      subscriptions: (
        await env.DB.prepare(
          "SELECT paid_through,source FROM subscriptions WHERE user_id=? ORDER BY paid_through DESC",
        )
          .bind(u.id)
          .all()
      ).results,
      claims: (
        await env.DB.prepare(
          "SELECT id,status,created_at FROM membership_claims WHERE user_id=?",
        )
          .bind(u.id)
          .all()
      ).results,
      checkoutEnabled: false,
    });
  if (path === "/subscription/claim" && req.method === "POST") {
    const b = z
      .object({ transactionId: z.string().min(3).max(100) })
      .parse(await parse(req));
    await rate(env, "claim:" + u.id, 5);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO membership_claims VALUES(?,?,?,?,?)",
    )
      .bind(crypto.randomUUID(), u.id, b.transactionId, "pending", now())
      .run();
    return json({
      message:
        "Claim submitted. Support will verify ownership independently; no access is granted yet.",
    });
  }
  if (path.startsWith("/pro/")) {
    if (!(await pro(env, u))) fail(403, "An active Pro membership is required");
    if (path === "/pro/preferences") {
      if (req.method === "GET")
        return json(
          (await env.DB.prepare(
            "SELECT data,retention_days FROM user_preferences WHERE user_id=?",
          )
            .bind(u.id)
            .first()) || { data: "{}", retention_days: 30 },
        );
      if (req.method === "PUT") {
        const b = z
          .object({
            data: z.record(z.string(), z.unknown()),
            retentionDays: z.union([
              z.literal(0),
              z.literal(7),
              z.literal(30),
              z.literal(90),
            ]),
          })
          .parse(await parse(req));
        await env.DB.prepare(
          "INSERT INTO user_preferences VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,retention_days=excluded.retention_days",
        )
          .bind(u.id, JSON.stringify(b.data), b.retentionDays)
          .run();
        await env.DB.prepare(
          "DELETE FROM tool_history WHERE user_id=? AND created_at<=?",
        )
          .bind(u.id, now() - b.retentionDays * 86400)
          .run();
        return json({ message: "Preferences saved" });
      }
    }
    if (path === "/pro/presets") {
      if (req.method === "GET")
        return json(
          (
            await env.DB.prepare(
              "SELECT * FROM saved_presets WHERE user_id=? ORDER BY created_at DESC",
            )
              .bind(u.id)
              .all()
          ).results,
        );
      if (req.method === "POST") {
        const b = z
          .object({
            kind: z.enum(["preset", "workflow"]),
            name: z.string().min(1).max(100),
            data: z.record(z.string(), z.unknown()),
          })
          .parse(await parse(req));
        const saved = await env.DB.prepare(
          "INSERT INTO saved_presets SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM saved_presets WHERE user_id=?)<100",
        )
          .bind(
            crypto.randomUUID(),
            u.id,
            b.kind,
            b.name,
            JSON.stringify(b.data),
            now(),
            u.id,
          )
          .run();
        if (!saved.meta.changes)
          fail(400, "Limit of 100 saved records reached");
        return json({ message: "Saved" });
      }
      if (req.method === "DELETE") {
        const { id } = z.object({ id: z.string() }).parse(await parse(req));
        await env.DB.prepare(
          "DELETE FROM saved_presets WHERE id=? AND user_id=?",
        )
          .bind(id, u.id)
          .run();
        return json({ message: "Deleted" });
      }
    }
    if (path === "/pro/history") {
      const pref = await env.DB.prepare(
        "SELECT retention_days FROM user_preferences WHERE user_id=?",
      )
        .bind(u.id)
        .first<{ retention_days: number }>();
      const days = pref?.retention_days ?? 30;
      await env.DB.prepare(
        "DELETE FROM tool_history WHERE user_id=? AND created_at<=?",
      )
        .bind(u.id, now() - days * 86400)
        .run();
      if (req.method === "GET")
        return json(
          (
            await env.DB.prepare(
              "SELECT * FROM tool_history WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
            )
              .bind(u.id)
              .all()
          ).results,
        );
      if (req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM tool_history WHERE user_id=?")
          .bind(u.id)
          .run();
        return json({ message: "History cleared" });
      }
      if (req.method === "POST") {
        const b = z
          .object({ tool: z.string().max(60), data: z.string().max(10000) })
          .parse(await parse(req));
        if (days === 0) return json({ message: "History is disabled" });
        await env.DB.batch([
          env.DB.prepare("INSERT INTO tool_history VALUES(?,?,?,?,?)").bind(
            crypto.randomUUID(),
            u.id,
            b.tool,
            b.data,
            now(),
          ),
          env.DB.prepare(
            "DELETE FROM tool_history WHERE user_id=? AND id NOT IN (SELECT id FROM tool_history WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100)",
          ).bind(u.id, u.id),
        ]);
        return json({ message: "History saved" });
      }
    }
  }
  if (path.startsWith("/admin")) {
    if (u.role !== "admin") fail(403, "Administrator access required");
    if (path === "/admin" && req.method === "GET") {
      const search = (url.searchParams.get("search") || "").slice(0, 100);
      return json({
        stats: await env.DB.prepare(
          "SELECT (SELECT count(*) FROM users) users,(SELECT count(DISTINCT user_id) FROM subscriptions WHERE paid_through>?) pro",
        )
          .bind(now())
          .first(),
        users: (
          await env.DB.prepare(
            "SELECT id,email,name,role,disabled FROM users WHERE email LIKE ? OR name LIKE ? LIMIT 30",
          )
            .bind("%" + search + "%", "%" + search + "%")
            .all()
        ).results,
        events: (
          await env.DB.prepare(
            "SELECT * FROM payment_events ORDER BY received_at DESC LIMIT 50",
          ).all()
        ).results,
        claims: (
          await env.DB.prepare(
            "SELECT * FROM membership_claims WHERE status=? LIMIT 50",
          )
            .bind("pending")
            .all()
        ).results,
        audit: (
          await env.DB.prepare(
            "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50",
          ).all()
        ).results,
        usage: (
          await env.DB.prepare(
            "SELECT * FROM usage_daily ORDER BY day DESC LIMIT 100",
          ).all()
        ).results,
        subscriptions: (
          await env.DB.prepare(
            "SELECT id,user_id,paid_through,source FROM subscriptions ORDER BY paid_through DESC LIMIT 100",
          ).all()
        ).results,
      });
    }
    if (path === "/admin/users" && req.method === "POST") {
      const b = z
        .object({ id: z.string(), disabled: z.boolean() })
        .parse(await parse(req));
      if (b.id === u.id) fail(400, "Cannot disable your own account");
      const updated = await env.DB.batch([
        env.DB.prepare("UPDATE users SET disabled=? WHERE id=?").bind(
          b.disabled ? 1 : 0,
          b.id,
        ),
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(b.id),
        env.DB.prepare(
          "INSERT INTO audit_logs SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=?)",
        ).bind(
          crypto.randomUUID(),
          u.id,
          "admin.user.disable:" + b.disabled,
          b.id,
          now(),
          b.id,
        ),
      ]);
      if (!updated[0].meta.changes) fail(404, "Account not found");
      return json({ message: "User updated" });
    }
    if (path === "/admin/reconcile" && req.method === "POST") {
      const b = z
        .object({
          claimId: z.string(),
          eventId: z.string(),
          paidThrough: z
            .number()
            .int()
            .min(now() + 1)
            .max(now() + (pricing.yearlyEnabled ? 366 : 32) * 86400),
          ownershipVerified: z.literal(true),
        })
        .parse(await parse(req));
      const claim = await env.DB.prepare(
        "SELECT * FROM membership_claims WHERE id=? AND status=?",
      )
        .bind(b.claimId, "pending")
        .first<{ id: string; user_id: string; transaction_id: string }>();
      const event = await env.DB.prepare(
        "SELECT * FROM payment_events WHERE id=? AND status=? AND member=1 AND currency=? AND CAST(amount AS REAL)>=?",
      )
        .bind(b.eventId, "pending", pricing.currency, pricing.monthly)
        .first<{ transaction_id: string }>();
      if (!claim || !event || claim.transaction_id !== event.transaction_id)
        fail(
          400,
          "Claim must match an authenticated, pending membership payment",
        );
      const subscriptionId = crypto.randomUUID();
      const reconciled = await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO subscriptions SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM membership_claims c JOIN payment_events e ON c.transaction_id=e.transaction_id WHERE c.id=? AND c.status='pending' AND e.id=? AND e.status='pending' AND e.member=1 AND e.currency=? AND CAST(e.amount AS REAL)>=?) AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE event_id=?)",
        ).bind(
          subscriptionId,
          claim!.user_id,
          b.eventId,
          b.paidThrough,
          "kofi-reviewed",
          now(),
          b.claimId,
          b.eventId,
          pricing.currency,
          pricing.monthly,
          b.eventId,
        ),
        env.DB.prepare(
          "UPDATE payment_events SET status=?,user_id=? WHERE id=? AND EXISTS(SELECT 1 FROM subscriptions WHERE id=?)",
        ).bind("linked", claim!.user_id, b.eventId, subscriptionId),
        env.DB.prepare(
          "UPDATE membership_claims SET status=? WHERE id=? AND EXISTS(SELECT 1 FROM subscriptions WHERE id=?)",
        ).bind("approved", b.claimId, subscriptionId),
        env.DB.prepare(
          "INSERT INTO audit_logs SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM subscriptions WHERE id=?)",
        ).bind(
          crypto.randomUUID(),
          u.id,
          "membership.reconcile",
          b.claimId,
          now(),
          subscriptionId,
        ),
      ]);
      if (!reconciled[0].meta.changes)
        fail(409, "Payment was already reconciled. Refresh before retrying.");
      return json({ message: "Membership reconciled" });
    }
    if (path === "/admin/subscriptions/revoke" && req.method === "POST") {
      const b = z
        .object({
          id: z.string(),
          reason: z.enum(["refund", "dispute", "incorrect-link", "manual"]),
        })
        .parse(await parse(req));
      const updated = await env.DB.batch([
        env.DB.prepare(
          "UPDATE subscriptions SET paid_through=? WHERE id=?",
        ).bind(now(), b.id),
        env.DB.prepare(
          "INSERT INTO audit_logs SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM subscriptions WHERE id=?)",
        ).bind(
          crypto.randomUUID(),
          u.id,
          "subscription.revoke:" + b.reason,
          b.id,
          now(),
          b.id,
        ),
      ]);
      if (!updated[0].meta.changes) fail(404, "Subscription not found");
      return json({ message: "Access period revoked" });
    }
    if (path === "/admin/mock-payment" && req.method === "POST") {
      if (env.ENVIRONMENT !== "development") fail(404, "Not found");
      const id = "mock-" + crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO payment_events VALUES(?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          id,
          "Subscription",
          pricing.monthly.toFixed(2),
          pricing.currency,
          1,
          now(),
          "pending",
          null,
        )
        .run();
      await audit(env, u.id, "mock.payment", id);
      return json({
        message:
          "Mock payment created. Submit a claim with this transaction ID.",
        transactionId: id,
      });
    }
    if (path === "/admin/tools" && req.method === "POST") {
      const b = z
        .object({ tool: z.string().min(1).max(50), enabled: z.boolean() })
        .parse(await parse(req));
      if (!tools.some((tool) => tool.id === b.tool)) fail(400, "Unknown tool");
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO tool_availability VALUES(?,?) ON CONFLICT(tool) DO UPDATE SET enabled=excluded.enabled",
        ).bind(b.tool, b.enabled ? 1 : 0),
        env.DB.prepare("INSERT INTO audit_logs VALUES(?,?,?,?,?)").bind(
          crypto.randomUUID(),
          u.id,
          "tool.availability:" + b.enabled,
          b.tool,
          now(),
        ),
      ]);
      return json({ message: "Availability updated" });
    }
  }
  fail(404, "Endpoint not found");
}
export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now()),
        env.DB.prepare(
          "DELETE FROM email_verification_tokens WHERE expires_at<=?",
        ).bind(now()),
        env.DB.prepare(
          "DELETE FROM password_reset_tokens WHERE expires_at<=?",
        ).bind(now()),
        env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(
          now(),
        ),
        env.DB.prepare(
          "DELETE FROM tool_history WHERE created_at<=?-86400*COALESCE((SELECT retention_days FROM user_preferences p WHERE p.user_id=tool_history.user_id),30)",
        ).bind(now()),
        env.DB.prepare("DELETE FROM audit_logs WHERE created_at<?").bind(
          now() - 180 * 86400,
        ),
        env.DB.prepare("DELETE FROM usage_daily WHERE day<?").bind(
          new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
        ),
      ]),
    );
  },
  async fetch(req: Request, env: Env, ctx?: ExecutionContext) {
    let response: Response;
    try {
      response = (await handle(req, env, ctx)) as Response;
    } catch (e) {
      response =
        e instanceof BodyTooLarge
          ? json({ error: "Request too large" }, 413)
          : e instanceof HttpError ||
              e instanceof AuthError ||
              e instanceof AccessError
            ? json({ error: e.message }, e.status)
            : e instanceof z.ZodError || e instanceof SyntaxError
              ? json({ error: "Invalid input" }, 400)
              : json({ error: "An unexpected error occurred" }, 500);
    }
    const h = new Headers(response.headers);
    h.set("Cache-Control", "no-store");
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "no-referrer");
    h.set("X-Frame-Options", "DENY");
    h.set(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    if (["production", "staging"].includes(env.ENVIRONMENT))
      h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    return new Response(response.body, { status: response.status, headers: h });
  },
};
