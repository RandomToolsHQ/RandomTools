import { describe, it, expect, vi, afterEach } from "vitest";
import {
  passwordBatch,
  passphraseBatch,
  usernames,
  fictionalProfiles,
  profilesCsv,
} from "../src/generators";
import { publicServerAddress, parseServerStatus } from "../src/minecraft";
afterEach(() => vi.useRealTimers());
describe("local generators", () => {
  it("generates constrained passwords and exact entropy without biased mandatory positions", () => {
    const result = passwordBatch({
      length: 20,
      count: 50,
      sets: ["upper", "lower", "digits", "symbols"],
    });
    expect(new Set(result.values).size).toBe(50);
    for (const p of result.values) {
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
    }
    expect(
      passwordBatch({ length: 8, count: 1, sets: [], custom: "ab" })
        .entropyBits,
    ).toBe(8);
    expect(result.entropyBits).toBeGreaterThan(120);
  });
  it("rejects invalid randomness parameters and invisible alphabets", () => {
    for (const custom of ["a", "a a", "a\u200bb", "00"]) {
      expect(() =>
        passwordBatch({ length: 8, count: 1, sets: [], custom }),
      ).toThrow();
    }
    expect(() =>
      passwordBatch({ length: 8.5, count: 1, sets: ["lower"] }),
    ).toThrow();
    expect(() =>
      passwordBatch({ length: 8, count: 51, sets: ["lower"] }),
    ).toThrow();
    const result = passwordBatch({
      length: 128,
      count: 2,
      sets: ["upper", "lower", "digits"],
      excludeAmbiguous: true,
    });
    expect(result.values.join("")).not.toMatch(/[Il1O0o]/);
  });
  it("uses the full EFF dictionary with independent word selection", async () => {
    const { effWords } = await import("../src/passphrase-words");
    expect(effWords).toHaveLength(7776);
    expect(new Set(effWords).size).toBe(7776);
    const result = await passphraseBatch(6, 10, " ");
    expect(result.entropyBits).toBeCloseTo(77.55, 1);
    for (const value of result.values) {
      const words = value.split(" ");
      expect(words).toHaveLength(6);
      expect(words.every((w) => effWords.includes(w))).toBe(true);
    }
    await expect(passphraseBatch(3, 1, " ")).rejects.toThrow();
    await expect(passphraseBatch(6, 1, "<")).rejects.toThrow();
  });
  it("generates valid unique Roblox ideas, never claims availability", () => {
    for (const format of ["mixed", "lower", "underscore"] as const) {
      const names = usernames({
        length: 16,
        count: 100,
        theme: "gaming",
        format,
        prefix: "Hi",
      });
      expect(new Set(names).size).toBe(100);
      for (const n of names) {
        expect(n).toHaveLength(16);
        expect(n).toMatch(/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?$/);
      }
    }
    expect(() =>
      usernames({
        length: 3,
        count: 1,
        theme: "random",
        format: "underscore",
        prefix: "ab",
      }),
    ).toThrow();
    expect(() =>
      usernames({
        length: 21,
        count: 1,
        theme: "random",
        format: "mixed",
        prefix: "",
      }),
    ).toThrow();
  });
  it("restricts identity emails to reserved domains and escapes CSV formulas", () => {
    const profiles = fictionalProfiles({
      count: 100,
      domain: "qa.example.com",
      format: "{first}.{last}.{n}",
    });
    expect(new Set(profiles.map((p) => p.email)).size).toBe(100);
    expect(profiles.every((p) => p.fictional)).toBe(true);
    expect(() =>
      fictionalProfiles({
        count: 1,
        domain: "gmail.com",
        format: "{username}",
      }),
    ).toThrow();
    expect(() =>
      fictionalProfiles({
        count: 1,
        domain: "example.com.attacker.org",
        format: "{username}",
      }),
    ).toThrow();
    expect(() =>
      fictionalProfiles({
        count: 1,
        domain: "example.com",
        format: "{unknown}",
      }),
    ).toThrow();
    expect(
      profilesCsv([{ ...profiles[0], displayName: "=FORMULA(1)" }]),
    ).toContain('"\'=FORMULA(1)"');
  });
});
describe("honest public server lookup", () => {
  it("rejects URLs, local addresses, ports and unsafe provider responses", () => {
    for (const value of [
      "https://example.org",
      "localhost",
      "127.0.0.1",
      "192.168.1.2",
      "a.local",
      "a..org",
      "-x.org",
      "x.org:0",
      "x.org:65536",
      "x.org/@x",
    ]) {
      expect(() => publicServerAddress(value)).toThrow();
    }
    expect(publicServerAddress(" PLAY.EXAMPLE.ORG:25565 ")).toBe(
      "play.example.org:25565",
    );
    expect(() => parseServerStatus({ online: "yes" })).toThrow();
    expect(
      parseServerStatus({
        online: true,
        players: { online: -1, max: "100" },
        version: { name_clean: "1.21" },
      }),
    ).toMatchObject({
      online: true,
      players: undefined,
      max: undefined,
      version: "1.21",
    });
  });
  it("caches provider data, paces requests and respects throttling without inventing offline status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
    const { serverStatus } = await import("../src/minecraft");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ online: true, players: { online: 3, max: 10 } }),
        ),
      );
    expect((await serverStatus("a.example.org", "java", fetcher)).players).toBe(
      3,
    );
    await serverStatus("a.example.org", "java", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      serverStatus("b.example.org", "java", fetcher),
    ).rejects.toThrow("wait");
    vi.advanceTimersByTime(1100);
    fetcher.mockResolvedValue(
      new Response("", { status: 429, headers: { "Retry-After": "120" } }),
    );
    await expect(
      serverStatus("b.example.org", "java", fetcher),
    ).rejects.toThrow("rate limit");
    vi.advanceTimersByTime(61000);
    await expect(
      serverStatus("b.example.org", "java", fetcher),
    ).rejects.toThrow("wait");
  });
});
