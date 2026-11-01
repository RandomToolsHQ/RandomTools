import { SignJWT, jwtVerify } from "jose";
import { digest, equal, now } from "./security";
import { readBody, BodyTooLarge } from "./body";
export interface AccessEnvironment {
  STAGING_GATE_ORIGIN?: string;
  STAGING_GATE_SIGNING_KEY?: string;
  STAGING_GATE_TESTERS?: string;
  GATE_DB?: D1Database;
}
export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Tester = { email: string; keyHash: string; expiresAt: number };
const cookieName = "__Host-rt_staging";
const audience = "randomtools-private-staging";
function config(env: AccessEnvironment, request: Request) {
  try {
    const origin = env.STAGING_GATE_ORIGIN!;
    if (
      !origin ||
      !origin.startsWith("https://") ||
      new URL(origin).origin !== origin ||
      !/^[a-f0-9]{64}$/.test(env.STAGING_GATE_SIGNING_KEY || "")
    )
      throw Error();
    const testers: Tester[] = JSON.parse(env.STAGING_GATE_TESTERS || "null");
    if (
      !Array.isArray(testers) ||
      !testers.length ||
      testers.length > 10 ||
      testers.some(
        (t) =>
          !t ||
          typeof t.email !== "string" ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email) ||
          t.email !== t.email.toLowerCase().trim() ||
          !/^[a-f0-9]{64}$/.test(t.keyHash) ||
          !Number.isSafeInteger(t.expiresAt),
      )
    )
      throw Error();
    if (new Set(testers.map((t) => t.email)).size !== testers.length)
      throw Error();
    if (new URL(request.url).origin !== origin)
      throw new AccessError(403, "Authorized staging origin required");
    const key = Uint8Array.from(
      env.STAGING_GATE_SIGNING_KEY!.match(/../g)!,
      (v) => parseInt(v, 16),
    );
    return { origin, testers, key };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503, "Private staging access is not configured");
  }
}
export async function requireStagingAccess(
  request: Request,
  env: AccessEnvironment,
): Promise<string> {
  const { origin, testers, key } = config(env, request);
  const cookies = (request.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(cookieName + "="));
  if (cookies.length !== 1 || cookies[0].length > 2048)
    throw new AccessError(403, "Authorized staging access required");
  try {
    const { payload } = await jwtVerify(
      cookies[0].slice(cookieName.length + 1),
      key,
      {
        algorithms: ["HS256"],
        issuer: origin,
        audience,
        requiredClaims: ["exp", "iat", "sub"],
        maxTokenAge: 1800,
      },
    );
    const tester = testers.find(
      (t) =>
        digest(t.email) === payload.sub &&
        t.expiresAt > now() &&
        equal(t.keyHash, String(payload.keyHash || "")),
    );
    if (!tester || Number(payload.exp) > Number(payload.iat) + 1800)
      throw Error();
    return tester.email;
  } catch {
    throw new AccessError(403, "Authorized staging access required");
  }
}
function cookie(value: string, age: number) {
  return `${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
}
function form(error = false) {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private staging access · RandomTools</title><style>body{font:18px system-ui;background:#0b1020;color:#f5f5ff;max-width:32rem;margin:8vh auto;padding:24px}label,input,button{display:block}input{box-sizing:border-box;width:100%;padding:12px;margin:8px 0 24px;border:1px solid #888;border-radius:6px;font:inherit}button{padding:12px 20px;font:inherit;background:#b8abff;color:#111;border:0;border-radius:6px}a{color:#b8abff}</style><h1>Private staging access</h1><p>Authorized testers only. Enter your named staging access key before account sign-in. This does not grant Pro or admin access.</p>${error ? '<p role="alert">Access could not be verified. Check your key or contact the project owner.</p>' : ""}<form action="/__staging" method="post"><label for="email">Approved tester email</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required><label for="key">Staging access key</label><input id="key" name="key" type="password" autocomplete="off" minlength="64" maxlength="64" pattern="[a-fA-F0-9]{64}" required><button>Enter private staging</button></form><p>Payments are disabled. <a href="https://randomtools-preview.pages.dev/">Public free tools</a></p></html>`,
    {
      status: error ? 403 : 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
// Only this credential form is public. It never loads Clerk or account assets.
export async function stagingGateway(
  request: Request,
  env: AccessEnvironment,
): Promise<Response> {
  const { origin, testers, key } = config(env, request);
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/__staging") return form();
  if (
    request.method !== "POST" ||
    request.headers.get("origin") !== origin ||
    request.headers.get("content-type")?.split(";")[0] !==
      "application/x-www-form-urlencoded"
  )
    throw new AccessError(403, "Staging request origin rejected");
  if (path === "/__staging/logout")
    return new Response(null, {
      status: 303,
      headers: { Location: "/__staging", "Set-Cookie": cookie("", 0) },
    });
  if (path !== "/__staging") throw new AccessError(404, "Not found");
  if (!env.GATE_DB)
    throw new AccessError(503, "Private staging access is not configured");
  const current = now();
  const rateKey =
    "staging-gate:" +
    digest(
      env.STAGING_GATE_SIGNING_KEY! +
        ":" +
        (request.headers.get("CF-Connecting-IP") || "unknown"),
    );
  const rate = await env.GATE_DB.prepare(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count",
  )
    .bind(rateKey, current + 900, current, current)
    .first<{ count: number }>();
  if (!rate || rate.count > 10)
    return new Response("Too many access attempts. Try again in 15 minutes.", {
      status: 429,
      headers: { "Retry-After": "900" },
    });
  let body: string;
  try {
    body = await readBody(request, 1024);
  } catch (error) {
    if (error instanceof BodyTooLarge)
      throw new AccessError(413, "Request too large");
    throw error;
  }
  const fields = new URLSearchParams(body);
  if (fields.getAll("email").length !== 1 || fields.getAll("key").length !== 1)
    return form(true);
  const email = (fields.get("email") || "").trim().toLowerCase();
  const raw = (fields.get("key") || "").toLowerCase();
  const candidate = digest(raw);
  const tester = testers.find(
    (t) =>
      equal(digest(t.email), digest(email)) &&
      equal(t.keyHash, candidate) &&
      t.expiresAt > current,
  );
  if (!/^[a-f0-9]{64}$/.test(raw) || !tester) return form(true);
  const exp = Math.min(current + 1800, tester.expiresAt);
  const jwt = await new SignJWT({ keyHash: tester.keyHash })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(origin)
    .setAudience(audience)
    .setSubject(digest(tester.email))
    .setIssuedAt(current)
    .setExpirationTime(exp)
    .sign(key);
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Set-Cookie": cookie(jwt, exp - current) },
  });
}
