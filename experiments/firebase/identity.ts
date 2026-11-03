import { importX509, jwtVerify, type JWTVerifyGetKey } from "jose";
import { digest, now } from "../../worker/security";

export interface FirebaseEnv {
  DB: D1Database;
  ENVIRONMENT: string;
  APP_ORIGIN: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_WEB_API_KEY: string;
  FIREBASE_TESTER_IDS: string;
  RATE_LIMIT_SECRET: string;
}
export class FirebaseError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const certificatesURL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certificates:
  { expires: number; values: Record<string, string> } | undefined;
const keys = new Map<string, Awaited<ReturnType<typeof importX509>>>();
const googleKey: JWTVerifyGetKey = async (header) => {
  if (
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    header.kid.length > 256
  )
    throw new FirebaseError(401, "Invalid identity token");
  if (!certificates || certificates.expires <= Date.now()) {
    let response: Response;
    try {
      response = await fetch(certificatesURL, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new FirebaseError(
        503,
        "Identity verification is temporarily unavailable",
      );
    }
    if (!response.ok)
      throw new FirebaseError(
        503,
        "Identity verification is temporarily unavailable",
      );
    const text = await response.text();
    if (text.length > 65536)
      throw new FirebaseError(503, "Invalid signing key response");
    let values: Record<string, string>;
    try {
      values = JSON.parse(text);
    } catch {
      throw new FirebaseError(503, "Invalid signing key response");
    }
    if (
      !values ||
      typeof values !== "object" ||
      Array.isArray(values) ||
      Object.values(values).some((v) => typeof v !== "string")
    )
      throw new FirebaseError(503, "Invalid signing key response");
    const age = Number(
      response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] || 0,
    );
    certificates = { values, expires: Date.now() + Math.min(age, 3600) * 1000 };
    keys.clear();
  }
  const cert = Object.prototype.hasOwnProperty.call(
    certificates.values,
    header.kid,
  )
    ? certificates.values[header.kid]
    : undefined;
  if (!cert) throw new FirebaseError(401, "Unknown identity signing key");
  let key = keys.get(header.kid);
  if (!key) {
    key = await importX509(cert, "RS256");
    keys.set(header.kid, key);
  }
  return key;
};
export type FirebaseIdentity = {
  subject: string;
  issuer: string;
  email: string;
  name: string;
  authTime: number;
  raw: string;
};

export function configuration(env: FirebaseEnv) {
  if (
    env.ENVIRONMENT !== "firebase-poc" ||
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.FIREBASE_PROJECT_ID || "") ||
    !env.FIREBASE_WEB_API_KEY ||
    env.RATE_LIMIT_SECRET?.length < 32
  )
    throw new FirebaseError(
      503,
      "Isolated Firebase proof of concept is not configured",
    );
  let testers: unknown;
  try {
    testers = JSON.parse(env.FIREBASE_TESTER_IDS);
  } catch {
    throw new FirebaseError(503, "Tester configuration is invalid");
  }
  if (
    !Array.isArray(testers) ||
    !testers.length ||
    testers.length > 10 ||
    testers.some((x) => typeof x !== "string" || !x.length || x.length > 128)
  )
    throw new FirebaseError(503, "Tester configuration is invalid");
  return {
    issuer: "https://securetoken.google.com/" + env.FIREBASE_PROJECT_ID,
    testers: testers as string[],
  };
}

export async function identity(
  req: Request,
  env: FirebaseEnv,
  gateEmail: string,
): Promise<FirebaseIdentity> {
  const config = configuration(env);
  const raw = req.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_.-]{1,8192})$/)?.[1];
  if (!raw) throw new FirebaseError(401, "Sign in to continue");
  let payload;
  try {
    ({ payload } = await jwtVerify(raw, googleKey, {
      algorithms: ["RS256"],
      issuer: config.issuer,
      audience: env.FIREBASE_PROJECT_ID,
      requiredClaims: ["sub", "exp", "iat", "auth_time"],
      clockTolerance: 0,
    }));
  } catch (error) {
    if (error instanceof FirebaseError) throw error;
    throw new FirebaseError(401, "Invalid or expired identity token");
  }
  if (
    payload.aud !== env.FIREBASE_PROJECT_ID ||
    typeof payload.sub !== "string" ||
    !payload.sub.length ||
    payload.sub.length > 128 ||
    !Number.isSafeInteger(payload.iat) ||
    payload.iat! > now() ||
    !Number.isSafeInteger(payload.auth_time) ||
    (payload.auth_time as number) < 0 ||
    (payload.auth_time as number) > now() ||
    payload.email_verified !== true
  )
    throw new FirebaseError(401, "Invalid or unverified account identity");
  if (
    payload.firebase &&
    typeof payload.firebase === "object" &&
    "tenant" in payload.firebase
  )
    throw new FirebaseError(
      401,
      "Tenant identities are not enabled in this experiment",
    );
  if (!config.testers.includes(payload.sub))
    throw new FirebaseError(
      403,
      "This account is not an authorized synthetic tester",
    );
  // Live lookup on EVERY request. Public-key caching is not an authorization cache.
  // Compare auth_time (not refreshed iat) against the provider revocation boundary.
  const account = await providerCall(env, "lookup", { idToken: raw });
  const profile = account.users?.[0];
  if (
    !profile ||
    profile.localId !== payload.sub ||
    profile.disabled === true ||
    profile.emailVerified !== true
  )
    throw new FirebaseError(401, "Account is no longer active or verified");
  if (
    typeof profile.validSince !== "string" ||
    !/^\d{1,12}$/.test(profile.validSince) ||
    Number(profile.validSince) > now()
  )
    throw new FirebaseError(503, "Provider revocation state is unavailable");
  if ((payload.auth_time as number) < Number(profile.validSince))
    throw new FirebaseError(401, "Session has been revoked");
  const email =
    typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  if (!email || email !== gateEmail)
    throw new FirebaseError(403, "Use the authorized testing identity");
  return {
    subject: payload.sub,
    issuer: config.issuer,
    email,
    name:
      typeof profile.displayName === "string"
        ? profile.displayName.trim().slice(0, 80) || "Synthetic member"
        : "Synthetic member",
    authTime: payload.auth_time as number,
    raw,
  };
}

export async function providerCall(
  env: FirebaseEnv,
  operation: "lookup" | "delete",
  body: { idToken: string },
) {
  let response: Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    throw new FirebaseError(
      503,
      "Authentication provider is temporarily unavailable",
    );
  }
  const text = await response.text();
  if (text.length > 65536)
    throw new FirebaseError(503, "Invalid provider response");
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new FirebaseError(503, "Invalid provider response");
  }
  if (!response.ok) {
    const code = result?.error?.message;
    if (
      [
        "USER_NOT_FOUND",
        "INVALID_ID_TOKEN",
        "TOKEN_EXPIRED",
        "USER_DISABLED",
      ].includes(code)
    )
      throw new FirebaseError(401, "Account or session is no longer active");
    if (code === "CREDENTIAL_TOO_OLD_LOGIN_AGAIN")
      throw new FirebaseError(
        403,
        "Sign in again before deleting your account",
      );
    throw new FirebaseError(
      503,
      response.status === 429
        ? "Authentication provider is rate limited"
        : "Authentication provider is temporarily unavailable",
    );
  }
  return result;
}

export async function account(env: FirebaseEnv, auth: FirebaseIdentity) {
  const id = "firebase_" + digest(auth.issuer + "\n" + auth.subject);
  let row = await env.DB.prepare(
    "SELECT a.user_id AS identity_id,a.state,u.*,r.revoked_before FROM auth_identities a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN poc_revocations r ON r.issuer=a.issuer AND r.subject=a.subject WHERE a.issuer=? AND a.subject=?",
  )
    .bind(auth.issuer, auth.subject)
    .first<{
      id: string;
      role: string;
      disabled: number;
      verified: number;
      state: string;
      revoked_before: number | null;
      name: string;
      email: string;
    }>();
  if (
    row &&
    (row.state !== "active" || !row.id || row.disabled || !row.verified)
  )
    throw new FirebaseError(403, "Account access is disabled");
  if (
    row?.revoked_before !== null &&
    row?.revoked_before !== undefined &&
    auth.authTime <= row.revoked_before
  )
    throw new FirebaseError(401, "Sign in again after session revocation");
  if (!row) {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO users(id,email,name,password_hash,verified,created_at) VALUES(?,?,?,'managed:firebase',1,?)",
      ).bind(id, auth.email, auth.name, now()),
      env.DB.prepare(
        "INSERT OR IGNORE INTO auth_identities(issuer,subject,user_id,created_at) SELECT ?,?,id,? FROM users WHERE id=?",
      ).bind(auth.issuer, auth.subject, now(), id),
    ]);
    row = await env.DB.prepare(
      "SELECT u.*,a.state,NULL AS revoked_before FROM users u JOIN auth_identities a ON a.user_id=u.id WHERE a.issuer=? AND a.subject=? AND a.state='active' AND u.disabled=0 AND u.verified=1",
    )
      .bind(auth.issuer, auth.subject)
      .first();
  }
  if (!row) throw new FirebaseError(403, "Account ownership requires review");
  return { id: row.id, role: row.role, name: row.name, email: row.email };
}
