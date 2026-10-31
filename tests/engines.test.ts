import { describe, it, expect } from "vitest";
import { convert, password, randomInt } from "../src/engines";
describe("free tool engines", () => {
  it("rejects explicit invalid lengths and empty random bounds", () => {
    for (const value of ["0", "abc", "7", "8.5", "129"])
      expect(() => convert("password", value, "", "")).toThrow();
    expect(convert("password", "", "", "")).toHaveLength(20);
    expect(() => convert("random", " ", "", "4")).toThrow();
    expect(() => convert("random", "0", "", " ")).toThrow();
  });
  it("handles accented case conversion and uppercase entity references", () => {
    expect(convert("case", "résumé café", "slug", "")).toBe("resume-cafe");
    expect(convert("case", "élan déjà don't", "title", "")).toBe(
      "Élan Déjà Don't",
    );
    expect(convert("html", "&AMP; &LT; &#X1F30F;", "decode", "")).toBe(
      "& < 🌏",
    );
    expect(convert("html", "&#xD800;", "decode", "")).toBe("�");
    expect(convert("html", "&copy; &nbsp; &NotEqualTilde;", "decode", "")).toBe(
      "© \u00a0 ≂̸",
    );
  });
  it("accepts RGB, HSL and shorthand HEX and rejects invalid channels", () => {
    expect(convert("colour", "hsl(120, 100%, 50%)", "", "")).toContain(
      "#00FF00",
    );
    expect(convert("colour", "#fff", "", "")).toContain("rgb(255, 255, 255)");
    expect(() => convert("colour", "rgb(300, 0, 0)", "", "")).toThrow();
    expect(() => convert("unix", "", "", "")).toThrow();
    expect(() => password(8.5)).toThrow();
  });
  it("formats JSON and rejects invalid input", () => {
    expect(convert("json", '{"a":1}', "", "")).toBe('{\n  "a": 1\n}');
    expect(() => convert("json", "no", "", "")).toThrow();
  });
  it("round trips Unicode Base64", () => {
    const s = "Hello 🌏 こんにちは";
    expect(
      convert("base64", convert("base64", s, "encode", ""), "decode", ""),
    ).toBe(s);
    expect(() => convert("base64", "???", "decode", "")).toThrow();
  });
  it("round trips URLs and HTML entities without interpreting markup", () => {
    const s = '<img src=x onerror="alert(1)"> & café';
    expect(convert("url", convert("url", s, "encode", ""), "decode", "")).toBe(
      s,
    );
    expect(
      convert("html", convert("html", s, "encode", ""), "decode", ""),
    ).toBe(s);
  });
  it("converts timestamps and snowflakes", () => {
    expect(convert("unix", "0", "", "")).toBe("1970-01-01T00:00:00.000Z");
    expect(convert("discord", "2020-01-01T00:00:00Z", "R", "")).toBe(
      "<t:1577836800:R>",
    );
    expect(
      JSON.parse(convert("snowflake", "175928847299117063", "", "")).created,
    ).toBe("2016-04-30T11:18:25.796Z");
  });
  it("validates randomness bounds and password length", () => {
    for (let i = 0; i < 30; i++) {
      expect(randomInt(-2, 2)).toBeGreaterThanOrEqual(-2);
      expect(randomInt(-2, 2)).toBeLessThanOrEqual(2);
    }
    expect(randomInt(4, 4)).toBe(4);
    expect(() => randomInt(10, 0)).toThrow();
    expect(password(24)).toHaveLength(24);
    expect(() => password(2)).toThrow();
  });
  it("counts Unicode and transforms text", () => {
    expect(JSON.parse(convert("counter", "a 🌏", "", "")).characters).toBe(3);
    expect(convert("case", "Hello World", "slug", "")).toBe("hello-world");
    expect(convert("colour", "#ff0000", "", "")).toContain("hsl(0, 100%, 50%)");
    expect(convert("diff", "before\n", "", "after\n")).toContain("+ after");
  });
  it("generates UUIDs and rejects malformed IDs and colours", () => {
    expect(convert("uuid", "2", "", "").split("\n")).toHaveLength(2);
    expect(() => convert("colour", "oops", "", "")).toThrow();
    expect(() => convert("snowflake", "abc", "", "")).toThrow();
  });
});
