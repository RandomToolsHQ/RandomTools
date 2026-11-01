import {
  AccessError,
  requireStagingAccess,
  stagingGateway,
  type AccessEnvironment,
} from "../worker/access";
declare const __STAGING_CSP__: string;
interface Environment extends AccessEnvironment {
  API: Fetcher;
  ASSETS: Fetcher;
  STAGING_CONTENT_ENABLED?: string;
}
export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const path = new URL(request.url).pathname;
    let response: Response;
    try {
      if (path === "/__staging" || path === "/__staging/logout") {
        response = await stagingGateway(request, env);
      } else {
        // The sole machine ingress: Clerk signature verification remains mandatory
        // in the API. No account/asset access is granted by this path exception.
        const webhook =
          path === "/api/webhooks/clerk" && request.method === "POST";
        if (!webhook) await requireStagingAccess(request, env);
        if (!webhook && env.STAGING_CONTENT_ENABLED !== "true")
          throw new AccessError(503, "Private account testing is not enabled");
        if (path === "/api" || path.startsWith("/api/")) {
          if (!env.API)
            throw new AccessError(503, "Private staging API is not configured");
          response = await env.API.fetch(request);
        } else {
          response = await env.ASSETS.fetch(request);
        }
      }
    } catch (error) {
      response = Response.json(
        {
          error:
            error instanceof AccessError
              ? error.message
              : "Private staging is unavailable",
        },
        { status: error instanceof AccessError ? error.status : 503 },
      );
      response.headers.set(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'",
      );
      if (
        error instanceof AccessError &&
        error.status === 403 &&
        request.method === "GET" &&
        request.headers.get("accept")?.includes("text/html") &&
        new URL(request.url).origin === env.STAGING_GATE_ORIGIN
      )
        response = new Response(null, {
          status: 303,
          headers: { Location: "/__staging" },
        });
    }
    const headers = new Headers(response.headers);
    if (!headers.has("Content-Security-Policy"))
      headers.set(
        "Content-Security-Policy",
        typeof __STAGING_CSP__ === "string"
          ? __STAGING_CSP__
          : "default-src 'none'; frame-ancestors 'none'",
      );
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    // Native same-origin POST forms need a non-null Origin. Cross-origin
    // destinations still receive no referrer (including Clerk/OAuth redirects).
    headers.set("Referrer-Policy", "same-origin");
    headers.set("Strict-Transport-Security", "max-age=31536000");
    return new Response(response.body, { status: response.status, headers });
  },
};
