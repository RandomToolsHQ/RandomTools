import { it, expect, vi } from "vitest";
import guard from "../public-staging/guard";
it("public preview denies every API route without calling assets or any backend", async () => {
  const fetch = vi.fn();
  for (const path of [
    "/api",
    "/api/me",
    "/api/auth/register",
    "/api/admin",
    "/api/pro/presets",
    "/api/account/export",
    "/api/webhooks/kofi",
  ])
    for (const method of ["GET", "POST"]) {
      const response = await guard.fetch(
        new Request("https://preview.example.test" + path, { method }),
        { ASSETS: { fetch } as any },
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-type")).toBe("application/json");
    }
  expect(fetch).not.toHaveBeenCalled();
});
it("public preview delegates only static frontend content to Pages assets", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("static frontend"));
  expect(
    await (
      await guard.fetch(
        new Request("https://preview.example.test/tools/json"),
        { ASSETS: { fetch } as any },
      )
    ).text(),
  ).toBe("static frontend");
  expect(fetch).toHaveBeenCalledOnce();
});
