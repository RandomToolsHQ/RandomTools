import { afterEach, expect, it, vi } from "vitest";
import { api } from "../src/api";
afterEach(() => vi.unstubAllGlobals());
it("turns platform HTML failures into a useful error without exposing response content", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("<html>internal details</html>", { status: 503 }),
      ),
  );
  await expect(api("/me")).rejects.toThrow(
    "Service unavailable (503). Please try again.",
  );
});
