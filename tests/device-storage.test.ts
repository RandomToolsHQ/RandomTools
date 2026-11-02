import { it, expect, vi, afterEach } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("does not keep counting after a failed attempt to revoke stored analytics consent", async () => {
  const stored = new Map([["analytics", "true"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) || null,
    setItem: () => {
      throw new DOMException("Synthetic quota failure", "QuotaExceededError");
    },
  });
  const { deviceGet, deviceSet } = await import("../src/device-storage");
  expect(deviceGet("analytics")).toBe("true");
  expect(deviceSet("analytics", "false")).toBe(false);
  expect(stored.get("analytics")).toBe("true");
  expect(deviceGet("analytics")).toBeNull();
  expect(deviceSet("analytics", "true")).toBe(false);
});
