import { createClerkClient } from "@clerk/backend";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { digest, now } from "./security";

export interface ClerkEnvironment {
  DB: D1Database;
  APP_ORIGIN: string;
  ENVIRONMENT: string;
  AUTH_PROVIDER?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_ISSUER?: string;
  CLERK_JWT_KEY?: string;
  CLERK_WEBHOOK_SIGNING_SECRET?: string;
  CLERK_TESTER_IDS?: string;
}
export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  verified: number;
  disabled: number;
  password_hash: string;
  clerk: {
    issuer: string;
    subject: string;
    sessionId: string;
    recent: boolean;
  };
};
export function clerkClient(env: ClerkEnvironment) {
  if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY || !env.CLERK_ISSUER)
    throw new AuthError(503, "Authentication is not configured");
  // Production hosting must never accidentally use a Clerk development instance.
  // Hosted staging is explicitly identified separately while retaining Secure cookies.
  if (
    env.ENVIRONMENT === "production" &&
    !env.CLERK_SECRET_KEY.startsWith("sk_live_")
  )
    throw new AuthError(
      503,
      "Production authentication requires live Clerk configuration",
    );
  return createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  });
}
export async function managedCurrent(
  req: Request,
  env: ClerkEnvironment,
): Promise<ManagedUser | null> {
  const client = clerkClient(env);
  // Only explicit short-lived bearer tokens from Clerk's in-memory frontend SDK.
  // Legacy rt_session cookies never authorize a managed identity.
  if (!req.headers.has("authorization")) return null;
  const state = await client.authenticateRequest(req, {
    authorizedParties: [env.APP_ORIGIN],
    acceptsToken: "session_token",
    jwtKey: env.CLERK_JWT_KEY,
  });
  if (!state.isAuthenticated) throw new AuthError(401, "Sign in to continue");
  const auth = state.toAuth();
  if (
    !auth?.userId ||
    !auth.sessionId ||
    auth.sessionClaims?.iss !== env.CLERK_ISSUER ||
    auth.sessionClaims?.azp !== env.APP_ORIGIN
  )
    throw new AuthError(401, "Invalid account identity");
  if (env.ENVIRONMENT === "staging") {
    let testers: unknown;
    try {
      testers = JSON.parse(env.CLERK_TESTER_IDS || "[]");
    } catch {
      throw new AuthError(503, "Staging tester configuration is invalid");
    }
    if (!Array.isArray(testers) || testers.some((id) => typeof id !== "string"))
      throw new AuthError(503, "Staging tester configuration is invalid");
    if (!testers.includes(auth.userId))
      throw new AuthError(
        403,
        "This account is not authorized for controlled testing",
      );
  }
  const session = await client.sessions.getSession(auth.sessionId);
  if (
    session.status !== "active" ||
    session.userId !== auth.userId ||
    session.expireAt <= Date.now()
  )
    throw new AuthError(401, "Session is no longer active");
  const profile = await client.users.getUser(auth.userId);
  const email = profile.emailAddresses.find(
    (e) => e.id === profile.primaryEmailAddressId,
  );
  if (
    profile.banned ||
    profile.locked ||
    !email ||
    email.verification?.status !== "verified"
  )
    throw new AuthError(403, "Verify your account before continuing");
  const identity = await env.DB.prepare(
    "SELECT user_id,state FROM auth_identities WHERE issuer=? AND subject=?",
  )
    .bind(env.CLERK_ISSUER, auth.userId)
    .first<{ user_id: string | null; state: string }>();
  if (identity && (identity.state !== "active" || !identity.user_id))
    throw new AuthError(403, "Account access is disabled");
  if (!identity) {
    // Deterministic ID makes concurrent first requests idempotent. A conflicting
    // legacy email cannot select, link or overwrite a different internal account.
    const id = "clerk_" + digest(env.CLERK_ISSUER + "\n" + auth.userId);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO users(id,email,name,password_hash,verified,created_at) VALUES(?,?,?,'managed:clerk',1,?)",
      ).bind(
        id,
        email.emailAddress.toLowerCase(),
        (profile.fullName || profile.username || "Member").slice(0, 80),
        now(),
      ),
      env.DB.prepare(
        "INSERT OR IGNORE INTO auth_identities(issuer,subject,user_id,created_at) SELECT ?,?,id,? FROM users WHERE id=?",
      ).bind(env.CLERK_ISSUER, auth.userId, now(), id),
    ]);
  }
  const user = await env.DB.prepare(
    "SELECT u.* FROM users u JOIN auth_identities a ON a.user_id=u.id WHERE a.issuer=? AND a.subject=? AND a.state='active' AND u.disabled=0",
  )
    .bind(env.CLERK_ISSUER, auth.userId)
    .first<Omit<ManagedUser, "clerk">>();
  if (!user)
    throw new AuthError(
      403,
      "Account requires an ownership review. Contact support.",
    );
  const fva = auth.sessionClaims?.fva;
  return {
    ...user,
    clerk: {
      issuer: env.CLERK_ISSUER!,
      subject: auth.userId,
      sessionId: auth.sessionId,
      recent:
        Array.isArray(fva) &&
        typeof fva[0] === "number" &&
        fva[0] >= 0 &&
        fva[0] < 5,
    },
  };
}

export async function managedWebhook(req: Request, env: ClerkEnvironment) {
  if (!env.CLERK_WEBHOOK_SIGNING_SECRET || !env.CLERK_ISSUER)
    throw new AuthError(503, "Webhook is not configured");
  let event;
  try {
    event = await verifyWebhook(req, {
      signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET,
    });
  } catch {
    throw new AuthError(401, "Invalid webhook");
  }
  if (event.type === "user.deleted" && event.data.id) {
    // Idempotent tombstone prevents delayed/replayed events from recreating data.
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE auth_identities SET state='deleted' WHERE issuer=? AND subject=?",
      ).bind(env.CLERK_ISSUER, event.data.id),
      env.DB.prepare(
        "DELETE FROM users WHERE id=(SELECT user_id FROM auth_identities WHERE issuer=? AND subject=?)",
      ).bind(env.CLERK_ISSUER, event.data.id),
    ]);
  }
  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function deleteManaged(env: ClerkEnvironment, user: ManagedUser) {
  if (!user.clerk.recent)
    throw new AuthError(
      403,
      "Sign in again before deleting your account (within five minutes).",
    );
  // Disable locally first. If the provider is unavailable, access stays closed;
  // the operator can retry completion rather than silently leaving active data.
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE auth_identities SET state='deleting' WHERE issuer=? AND subject=?",
    ).bind(user.clerk.issuer, user.clerk.subject),
    env.DB.prepare("UPDATE users SET disabled=1 WHERE id=?").bind(user.id),
  ]);
  await clerkClient(env).users.deleteUser(user.clerk.subject);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE auth_identities SET state='deleted' WHERE issuer=? AND subject=?",
    ).bind(user.clerk.issuer, user.clerk.subject),
    env.DB.prepare("DELETE FROM users WHERE id=?").bind(user.id),
  ]);
}
