import { describe, it, expect, vi } from "vitest";
import {
  digest,
  equal,
  hashPassword,
  verifyPassword,
} from "../worker/security";
describe("password and token security", () => {
  it("hashes passwords using salted PBKDF2 and verifies them", async () => {
    const hashed = await hashPassword("a strong password here");
    expect(hashed).not.toContain("a strong password here");
    expect(await verifyPassword("a strong password here", hashed)).toBe(true);
    expect(await verifyPassword("wrong password", hashed)).toBe(false);
  }, 30000);
  it("compares secret digests and rejects changed values", () => {
    expect(equal("secret", "secret")).toBe(true);
    expect(equal("secret", "changed")).toBe(false);
    expect(digest("token")).toHaveLength(64);
  });
  it("preserves the work factor when native Workers PBKDF2 is capped", async () => {
    const salt = "1".repeat(64);
    const native = await hashPassword("a strong password here", salt);
    const spy = vi
      .spyOn(crypto.subtle, "deriveBits")
      .mockRejectedValue(
        new DOMException("iteration limit", "NotSupportedError"),
      );
    try {
      expect(await hashPassword("a strong password here", salt)).toBe(native);
    } finally {
      spy.mockRestore();
    }
  }, 30000);
});
