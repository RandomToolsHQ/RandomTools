import { describe, it, expect } from "vitest";
import { readBody, BodyTooLarge } from "../worker/body";
describe("streamed request limits", () => {
  it("rejects malformed UTF-8 as invalid input", async () => {
    await expect(
      readBody(
        new Request("https://example.test", {
          method: "POST",
          body: new Uint8Array([0xff]),
        }),
        10,
      ),
    ).rejects.toBeInstanceOf(SyntaxError);
  });
  it("counts UTF-8 bytes rather than characters", async () => {
    await expect(
      readBody(
        new Request("https://example.test", { method: "POST", body: "🌏🌏" }),
        7,
      ),
    ).rejects.toBeInstanceOf(BodyTooLarge);
  });
  it("cancels oversized bodies without trusting Content-Length", async () => {
    let canceled = false;
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(5));
        c.enqueue(new Uint8Array(5));
      },
      cancel() {
        canceled = true;
      },
    });
    await expect(
      readBody(
        new Request("https://example.test", {
          method: "POST",
          body: stream,
          duplex: "half",
        } as RequestInit),
        8,
      ),
    ).rejects.toBeInstanceOf(BodyTooLarge);
    expect(canceled).toBe(true);
  });
  it("decodes multibyte characters split between chunks", async () => {
    const bytes = new TextEncoder().encode("🌏");
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, 2));
        c.enqueue(bytes.slice(2));
        c.close();
      },
    });
    expect(
      await readBody(
        new Request("https://example.test", {
          method: "POST",
          body: stream,
          duplex: "half",
        } as RequestInit),
        4,
      ),
    ).toBe("🌏");
  });
});
