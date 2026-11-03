import {
  requireStagingAccess,
  stagingGateway,
  AccessError,
  type AccessEnvironment,
} from "../../worker/access";
type Env = AccessEnvironment & {
  API: Fetcher;
  ASSETS: Fetcher;
  GATE_DB: D1Database;
};
export default {
  async fetch(req: Request, env: Env) {
    let response: Response;
    try {
      if (
        (await env.GATE_DB.prepare(
          "SELECT value FROM poc_metadata WHERE key='isolation'",
        ).first("value")) !== "randomtools-firebase-poc-v1"
      )
        throw new AccessError(503, "Isolated testing database is unavailable");
      const p = new URL(req.url).pathname;
      if (p === "/__staging" || p === "/__staging/logout")
        response = await stagingGateway(req, env);
      else {
        await requireStagingAccess(req, env);
        response =
          p === "/api" || p.startsWith("/api/")
            ? await env.API.fetch(req)
            : await env.ASSETS.fetch(req);
      }
    } catch (e) {
      response = Response.json(
        {
          error:
            e instanceof AccessError
              ? e.message
              : "Private Firebase experiment is unavailable",
        },
        { status: e instanceof AccessError ? e.status : 503 },
      );
    }
    // ASSETS/service-binding responses have immutable headers in the hosted
    // runtime. Clone before applying the private security policy.
    response = new Response(response.body, response);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set(
      "Cross-Origin-Opener-Policy",
      "same-origin-allow-popups",
    );
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://apis.google.com; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://randomtools-firebase-poc.firebaseapp.com; frame-src https://randomtools-firebase-poc.firebaseapp.com https://accounts.google.com; style-src 'self'; img-src 'self' data: https://*.googleusercontent.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    return response;
  },
};
