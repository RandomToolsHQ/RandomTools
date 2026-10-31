import { describe, it, expect, vi, afterEach } from "vitest";
import { deliverEmail, emailMode } from "../worker/email";
const configured = {
  ENVIRONMENT: "production",
  EMAIL_PROVIDER: "resend",
  EMAIL_FROM: "sender@example.test",
  RESEND_API_KEY: "test-only-provider-key",
};
afterEach(() => vi.unstubAllGlobals());
describe("email delivery adapter (mocked transport; no email sent)", () => {
  it("fails closed without production configuration and never exposes development mode in production", () => {
    expect(emailMode({ ENVIRONMENT: "production" })).toBe("disabled");
    expect(
      emailMode({ ENVIRONMENT: "production", EMAIL_PROVIDER: "development" }),
    ).toBe("disabled");
    expect(emailMode({ ENVIRONMENT: "development" })).toBe("development");
    expect(emailMode({ ...configured, EMAIL_FROM: "invalid" })).toBe(
      "disabled",
    );
  });
  it("uses the documented provider endpoint, text content and idempotency header", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "provider-message" }));
    vi.stubGlobal("fetch", transport);
    await deliverEmail(
      configured,
      "reader@example.test",
      "verify",
      "https://example.test/verify-email?token=test",
      "request-key",
    );
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["Idempotency-Key"]).toBe("request-key");
    expect(JSON.parse(init.body)).toMatchObject({
      from: configured.EMAIL_FROM,
      to: ["reader@example.test"],
    });
    expect(JSON.parse(init.body).text).toContain("24 hours");
  });
  it("rejects provider failure and malformed acceptance without exposing credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "sensitive" }, { status: 403 }),
        ),
    );
    await expect(
      deliverEmail(
        configured,
        "reader@example.test",
        "reset",
        "https://example.test/reset",
        "key",
      ),
    ).rejects.toThrow("Email provider rejected");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    await expect(
      deliverEmail(
        configured,
        "reader@example.test",
        "reset",
        "https://example.test/reset",
        "key",
      ),
    ).rejects.toThrow("Invalid email provider response");
  });
});
