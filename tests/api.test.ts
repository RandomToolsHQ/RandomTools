import { describe, it, expect } from "vitest";
import worker from "../worker/index";
const env = {
  APP_ORIGIN: "http://localhost:5173",
  ENVIRONMENT: "test",
  PAYMENTS_ENABLED: "false",
  DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
} as any;
describe("API boundaries", () => {
  it("rejects cross-origin account mutations before accessing data", async () => {
    const r = await worker.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          origin: "https://attacker.test",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      env,
    );
    expect(r.status).toBe(403);
  });
  it("reports guest status without a session", async () => {
    const r = await worker.fetch(new Request("http://localhost/api/me"), env);
    expect(await r.json()).toEqual({ user: null, pro: false });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("requires authentication for Pro and admin endpoints", async () => {
    for (const path of ["/pro/presets", "admin"]) {
      const r = await worker.fetch(
        new Request("http://localhost/api/" + path.replace(/^\//, "")),
        env,
      );
      expect(r.status).toBe(401);
    }
  });
  it("fails closed when payments are disabled", async () => {
    const r = await worker.fetch(
      new Request("http://localhost/api/webhooks/kofi", {
        method: "POST",
        body: "data={}",
      }),
      env,
    );
    expect(r.status).toBe(503);
  });
});
