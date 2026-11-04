// LOCAL CANDIDATE ONLY. New isolated Pages/D1 bindings require owner approval.
import {
  requireStagingAccess,
  stagingGateway,
  AccessError,
  type AccessEnvironment,
} from "../../worker/access";
import { digest } from "../../worker/security";
import { readBody, BodyTooLarge } from "../../worker/body";
export const gatewayOrigin = "https://randomtools-phase11-supabase.pages.dev";
export const edgeURL =
  "https://ijlohzzqszyhncglqsfq.supabase.co/functions/v1/randomtools-phase11";
export type GatewayEnv = AccessEnvironment & {
  GATE_DB: D1Database;
  ASSETS: Fetcher;
  POC_ACCESS_KEY: string;
  PHASE111_GATEWAY: string;
};
const appCookie = "__Host-rt_phase11";
function configuration(req: Request, env: GatewayEnv) {
  if (
    env.PHASE111_GATEWAY !== "phase111-gateway-v1" ||
    env.STAGING_GATE_ORIGIN !== gatewayOrigin ||
    new URL(req.url).origin !== gatewayOrigin ||
    !/^[a-f0-9]{64}$/.test(env.POC_ACCESS_KEY || "")
  )
    throw new AccessError(503, "Isolated gateway is not configured");
  let testers: unknown;
  try {
    testers = JSON.parse(env.STAGING_GATE_TESTERS || "null");
  } catch {
    throw new AccessError(503, "Invalid isolated testers");
  }
  if (
    !Array.isArray(testers) ||
    testers.length < 1 ||
    testers.length > 3 ||
    testers.some(
      (t) =>
        !/^phase11-[a-f0-9-]+-(admin|member|other)@example\.com$/.test(
          t?.email || "",
        ),
    )
  )
    throw new AccessError(503, "Synthetic testers required");
}
function cookieHeader(req: Request) {
  const parts = (req.headers.get("cookie") || "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.startsWith(appCookie + "="));
  if (
    parts.length > 1 ||
    (parts.length === 1 &&
      !new RegExp("^" + appCookie + "=[a-f0-9]{64}$").test(parts[0]))
  )
    throw new AccessError(401, "Invalid application session");
  return parts[0] || "";
}
function responseCookie(response: Response) {
  const values = response.headers.getSetCookie();
  if (!values.length) return undefined;
  if (values.length !== 1)
    throw new AccessError(503, "Invalid session response");
  const value = values[0],
    fields = value.split(";").map((s) => s.trim()),
    first = fields.shift()!;
  if (!new RegExp("^" + appCookie + "=(?:[a-f0-9]{64})?$").test(first))
    throw new AccessError(503, "Invalid session response");
  const normalized = fields.map((x) => x.toLowerCase());
  if (
    !normalized.includes("secure") ||
    !normalized.includes("httponly") ||
    !normalized.includes("samesite=strict") ||
    !normalized.includes("path=/") ||
    normalized.some(
      (x) =>
        !["secure", "httponly", "samesite=strict", "path=/"].includes(x) &&
        !/^max-age=\d{1,4}$/.test(x),
    ) ||
    normalized.filter((x) => x.startsWith("max-age=")).length !== 1
  )
    throw new AccessError(503, "Invalid session response");
  const age = Number(
    normalized.find((x) => x.startsWith("max-age="))!.slice(8),
  );
  if (age > 1800 || (first.endsWith("=") && age !== 0))
    throw new AccessError(503, "Invalid session response");
  return value;
}
export function createGateway(env: GatewayEnv, upstream: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    let response: Response;
    try {
      configuration(req, env);
      if (
        (await env.GATE_DB.prepare(
          "SELECT value FROM poc_metadata WHERE key='isolation'",
        ).first("value")) !== "randomtools-phase111-gateway-v1"
      )
        throw new AccessError(503, "Isolated gateway database required");
      const url = new URL(req.url),
        path = url.pathname;
      if (path === "/__staging" || path === "/__staging/logout")
        response = await stagingGateway(req, env);
      else {
        const email = await requireStagingAccess(req, env);
        if (path === "/api/phase11") {
          if (
            url.search ||
            req.method !== "POST" ||
            req.headers.get("origin") !== gatewayOrigin ||
            req.headers.get("content-type")?.split(";")[0] !==
              "application/json"
          )
            throw new AccessError(403, "Request origin or method rejected");
          const authorization = req.headers.get("authorization") || "";
          if (!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(authorization))
            throw new AccessError(401, "Sign in to continue");
          const body = await readBody(req, 16384);
          // Fixed URL, explicit header allowlist. Never forward caller access keys,
          // tester bindings, host headers, staging cookies or arbitrary destinations.
          let result: Response;
          try {
            result = await upstream(edgeURL, {
              method: "POST",
              headers: {
                origin: gatewayOrigin,
                authorization,
                "content-type": "application/json",
                "x-poc-access": env.POC_ACCESS_KEY,
                "x-poc-tester": digest(email),
                cookie: cookieHeader(req),
              },
              body,
              redirect: "error",
              signal: AbortSignal.timeout(15000),
            });
          } catch (e) {
            if (e instanceof AccessError) throw e;
            throw new AccessError(503, "Testing backend is unavailable");
          }
          if (
            !result.headers.get("content-type")?.startsWith("application/json")
          )
            throw new AccessError(503, "Invalid backend response");
          let text: string;
          try {
            text = await readBody(result, 1048576);
          } catch {
            throw new AccessError(503, "Invalid backend response");
          }
          const headers = new Headers({ "content-type": "application/json" });
          const session = responseCookie(result);
          if (session) headers.set("set-cookie", session);
          for (const name of ["retry-after", "server-timing"]) {
            const value = result.headers.get(name);
            if (value && value.length < 256) headers.set(name, value);
          }
          response = new Response(text, { status: result.status, headers });
        } else if (path === "/api" || path.startsWith("/api/"))
          throw new AccessError(404, "Unknown testing route");
        else {
          if (!["GET", "HEAD"].includes(req.method))
            throw new AccessError(405, "Method rejected");
          response = await env.ASSETS.fetch(req);
        }
      }
    } catch (e) {
      response = Response.json(
        {
          error:
            e instanceof AccessError
              ? e.message
              : "Testing gateway is unavailable",
        },
        {
          status:
            e instanceof AccessError
              ? e.status
              : e instanceof BodyTooLarge
                ? 413
                : e instanceof SyntaxError
                  ? 400
                  : 503,
        },
      );
    }
    response = new Response(response.body, response);
    for (const [key, value] of Object.entries({
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": ["/__staging", "/__staging/logout"].includes(
        new URL(req.url).pathname,
      )
        ? "same-origin"
        : "no-referrer",
      "Content-Security-Policy":
        (new URL(req.url).pathname.startsWith("/__staging") &&
          response.headers.get("content-security-policy")) ||
        "default-src 'self'; script-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    }))
      response.headers.set(key, value);
    return response;
  };
}
export default {
  fetch(req: Request, env: GatewayEnv) {
    return createGateway(env)(req);
  },
};
