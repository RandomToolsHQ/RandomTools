import { decodeJwt } from "jose";
import {
  identity,
  providerCall,
  FirebaseError,
  type FirebaseIdentity,
  type FirebaseEnv,
} from "../firebase/identity";
import { digest, equal, token } from "../../worker/security";
import { readBody, BodyTooLarge } from "../../worker/body";

export type Config = {
  enabled: string;
  projectRef: string;
  origin: string;
  accessKey: string;
  firebaseProject: string;
  firebaseKey: string;
  rateSecret: string;
  testers: Record<string, string>;
  serviceKey: string;
};
export type Store = {
  rpc(name: string, body: Record<string, unknown>): Promise<any>;
};
export class Denied extends Error {
  constructor(public status: number) {
    super("Request denied");
  }
}
export function validate(c: Config) {
  if (
    c.enabled !== "phase11-synthetic-only" ||
    !/^[a-z]{20}$/.test(c.projectRef) ||
    (!/^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(c.origin) &&
      !/^http:\/\/127\.0\.0\.1:54381$/.test(c.origin)) ||
    !/^[a-f0-9]{64}$/.test(c.accessKey) ||
    c.firebaseProject !== "randomtools-supabase-auth-poc" ||
    !c.firebaseKey ||
    c.rateSecret.length < 32 ||
    !c.serviceKey ||
    Object.keys(c.testers).length < 1 ||
    Object.keys(c.testers).length > 3 ||
    Object.entries(c.testers).some(
      ([uid, email]) =>
        !uid ||
        uid.length > 128 ||
        !/^phase11-[a-f0-9-]+-(admin|member|other)@example\.com$/.test(email),
    )
  )
    throw new Denied(503);
}
export function firebaseEnvironment(c: Config): FirebaseEnv {
  // Reuse the reviewed verifier unchanged; it does not use DB in identity/providerCall.
  return {
    ENVIRONMENT: "firebase-poc",
    APP_ORIGIN: c.origin,
    FIREBASE_PROJECT_ID: c.firebaseProject,
    FIREBASE_WEB_API_KEY: c.firebaseKey,
    FIREBASE_TESTER_IDS: JSON.stringify(Object.keys(c.testers)),
    RATE_LIMIT_SECRET: c.rateSecret,
  } as FirebaseEnv;
}
export function makeAuthenticator(c: Config) {
  return async (req: Request): Promise<FirebaseIdentity> => {
    const raw = req.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_.-]{1,8192})$/)?.[1];
    if (!raw) throw new Denied(401);
    let uid: string | undefined;
    try {
      uid = decodeJwt(raw).sub;
    } catch {
      throw new Denied(401);
    }
    // Unverified subject selects an allowlist entry only; identity verifies all claims
    // and performs a live provider lookup before any database authorization.
    const email = uid ? c.testers[uid] : undefined;
    if (!email) throw new Denied(403);
    return identity(req, firebaseEnvironment(c), email);
  };
}
export function makeStore(c: Config, fetcher: typeof fetch = fetch): Store {
  return {
    async rpc(name, body) {
      if (!["rt11_rate", "rt11_request", "rt11_finish_delete"].includes(name))
        throw new Denied(503);
      let response: Response;
      try {
        response = await fetcher(
          `https://${c.projectRef}.supabase.co/rest/v1/rpc/${name}`,
          {
            method: "POST",
            headers: {
              apikey: c.serviceKey,
              authorization: "Bearer " + c.serviceKey,
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          },
        );
      } catch {
        throw new Denied(503);
      }
      let value;
      try {
        value = JSON.parse(await readBody(response, 1048576));
      } catch {
        throw new Denied(503);
      }
      if (!response.ok) {
        const statuses: Record<string, number> = {
          RT400: 400,
          RT401: 401,
          RT403: 403,
          RT404: 404,
          RT409: 409,
          RT429: 429,
        };
        throw new Denied(statuses[value?.code] || 503);
      }
      return value;
    },
  };
}
const cookieName = "__Host-rt_phase11";
const sessionCookie = (raw: string, age = 1800) =>
  `${cookieName}=${raw}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}`;
const operations = [
  "session",
  "me",
  "workspace",
  "profile",
  "save",
  "delete",
  "grant",
  "revoke",
  "admin",
  "export",
  "logout",
  "account-delete",
];
export function createHandler(
  c: Config,
  store: Store,
  authenticate = makeAuthenticator(c),
  removeProvider = (auth: FirebaseIdentity) =>
    providerCall(firebaseEnvironment(c), "delete", { idToken: auth.raw }),
) {
  return async (req: Request): Promise<Response> => {
    const start = performance.now();
    const headers = new Headers({
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      vary: "Origin",
    });
    try {
      validate(c);
      if (req.headers.get("origin") !== c.origin) throw new Denied(403);
      headers.set("access-control-allow-origin", c.origin);
      headers.set("access-control-allow-credentials", "true");
      headers.set(
        "access-control-expose-headers",
        "Server-Timing, Retry-After",
      );
      if (req.method === "OPTIONS") {
        headers.set("access-control-allow-methods", "POST");
        headers.set(
          "access-control-allow-headers",
          "authorization,content-type,x-poc-access",
        );
        return new Response(null, { status: 204, headers });
      }
      if (req.method !== "POST") throw new Denied(405);
      const key = req.headers.get("x-poc-access") || "";
      if (key.length !== 64 || !equal(key, c.accessKey)) throw new Denied(403);
      if (req.headers.get("content-type")?.split(";")[0] !== "application/json")
        throw new Denied(415);
      const input = JSON.parse(await readBody(req, 16384));
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        !operations.includes(input.operation) ||
        Object.keys(input).some((k) => !["operation", "body"].includes(k))
      )
        throw new Denied(400);
      if (
        !(await store.rpc("rt11_rate", {
          p_key: "global",
          p_limit: 20,
          p_window: 10,
        }))
      )
        throw new Denied(429);
      const auth = await authenticate(req);
      if (
        !(await store.rpc("rt11_rate", {
          p_key: "user:" + digest(auth.subject),
          p_limit: 60,
          p_window: 60,
        }))
      )
        throw new Denied(429);
      const op = input.operation as string;
      const cookies = (req.headers.get("cookie") || "")
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.startsWith(cookieName + "="));
      const raw =
        op === "session"
          ? token()
          : cookies.length === 1
            ? cookies[0].slice(cookieName.length + 1)
            : "";
      if (!/^[a-f0-9]{64}$/.test(raw)) throw new Denied(401);
      let body = input.body ?? {};
      if (op === "save") {
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          !body.data ||
          typeof body.data !== "object" ||
          Array.isArray(body.data)
        )
          throw new Denied(400);
        body = { ...body, data: JSON.stringify(body.data) };
      }
      if (
        op === "account-delete" &&
        JSON.stringify(body) !== '{"confirmation":"DELETE"}'
      )
        throw new Denied(400);
      const hash = digest(raw);
      const result = await store.rpc("rt11_request", {
        p_subject: auth.subject,
        p_auth_time: auth.authTime,
        p_session: hash,
        p_operation: op === "account-delete" ? "delete-begin" : op,
        p_body: op === "account-delete" ? {} : body,
      });
      if (op === "account-delete") {
        // DB tombstone/session revocation precede provider deletion. On dependency
        // failure access stays denied and a durable audit event requires reconciliation.
        await removeProvider(auth);
        await store.rpc("rt11_finish_delete", {
          p_subject: auth.subject,
          p_nonce: hash,
        });
        headers.set("set-cookie", sessionCookie("", 0));
      } else if (op === "session")
        headers.set("set-cookie", sessionCookie(raw));
      else if (op === "logout") headers.set("set-cookie", sessionCookie("", 0));
      headers.set(
        "server-timing",
        `handler;dur=${(performance.now() - start).toFixed(2)}`,
      ); // WALL, never CPU.
      return Response.json(
        op === "account-delete" ? { deleted: true } : result,
        { headers },
      );
    } catch (error) {
      const status =
        error instanceof Denied || error instanceof FirebaseError
          ? error.status
          : error instanceof BodyTooLarge
            ? 413
            : error instanceof SyntaxError
              ? 400
              : 503;
      if (status === 429 || status === 503)
        headers.set("retry-after", status === 429 ? "60" : "10");
      return Response.json(
        { error: status === 503 ? "Dependency unavailable" : "Request denied" },
        { status, headers },
      );
    }
  };
}
