import { it, expect, vi } from "vitest";
import guard from "../experiments/firebase/pages-guard";
vi.mock("../worker/access", async (original) => ({
  ...(await original<any>()),
  requireStagingAccess: vi.fn().mockResolvedValue("synthetic@example.test"),
}));
it("clones immutable binding responses before adding private security headers", async () => {
  const env: any = {
    GATE_DB: {
      prepare: () => ({ first: async () => "randomtools-firebase-poc-v1" }),
    },
    ASSETS: {
      fetch: async () => Response.redirect("https://poc.example.test/", 302),
    },
  };
  const r = await guard.fetch(new Request("https://poc.example.test/"), env);
  expect(r.status).toBe(302);
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(r.headers.get("Content-Security-Policy")).toContain(
    "frame-ancestors 'none'",
  );
});
