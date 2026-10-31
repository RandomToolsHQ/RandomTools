// This public artifact has no binding to the development-authenticated API.
export default {
  async fetch(request: Request, env: { ASSETS: Fetcher }) {
    const path = new URL(request.url).pathname;
    if (path === "/api" || path.startsWith("/api/")) {
      const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      };
      return new Response(
        JSON.stringify({
          error:
            "Account, admin and Pro APIs are not available on this public tools preview.",
        }),
        { status: 403, headers },
      );
    }
    return env.ASSETS.fetch(request);
  },
};
