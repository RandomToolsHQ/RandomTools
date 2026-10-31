import { decodeHTMLStrict } from "entities/decode";
import { diffLines } from "diff";
import { parseColour } from "./colour";
export function randomInt(min: number, max: number) {
  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max) ||
    max < min ||
    max - min >= 4294967296
  )
    throw Error("Enter safe integers with a range below 2³².");
  const range = max - min + 1;
  const limit = Math.floor(4294967296 / range) * range;
  let n: number;
  do {
    n = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (n >= limit);
  return min + (n % range);
}
export function password(length: number) {
  if (!Number.isInteger(length) || length < 8 || length > 128)
    throw Error("Length must be an integer from 8–128.");
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";
  return Array.from(
    { length },
    () => alphabet[randomInt(0, alphabet.length - 1)],
  ).join("");
}
export function convert(
  id: string,
  input: string,
  mode: string,
  other: string,
) {
  switch (id) {
    case "json":
      return JSON.stringify(
        JSON.parse(input),
        null,
        mode === "compact" ? 0 : 2,
      );
    case "base64":
      return mode === "decode"
        ? new TextDecoder("utf-8", { fatal: true }).decode(
            Uint8Array.from(atob(input), (c) => c.charCodeAt(0)),
          )
        : btoa(
            Array.from(new TextEncoder().encode(input), (c) =>
              String.fromCharCode(c),
            ).join(""),
          );
    case "url":
      return mode === "decode"
        ? decodeURIComponent(input)
        : encodeURIComponent(input);
    case "unix": {
      if (!input.trim()) throw Error("Enter a date or timestamp.");
      const d =
        mode === "date" ? new Date(input) : new Date(Number(input) * 1000);
      if (!Number.isFinite(d.getTime()))
        throw Error("Enter a valid date or timestamp.");
      return mode === "date"
        ? String(Math.floor(d.getTime() / 1000))
        : d.toISOString();
    }
    case "uuid":
      if (
        input &&
        (!Number.isInteger(Number(input)) ||
          Number(input) < 1 ||
          Number(input) > 100)
      )
        throw Error("Enter an integer from 1–100.");
      return Array.from(
        { length: Math.min(100, Math.max(1, Number(input) || 1)) },
        () => crypto.randomUUID(),
      ).join("\n");
    case "diff": {
      if (input.length + other.length > 100000)
        throw Error("Diff input is limited to 100,000 total characters.");
      const parts = diffLines(input, other, {
        timeout: 1000,
        maxEditLength: 10000,
      });
      if (!parts)
        throw Error(
          "Comparison exceeded the complexity limit. Try smaller inputs.",
        );
      return parts
        .map((p) => (p.added ? "+ " : p.removed ? "- " : "  ") + p.value)
        .join("");
    }
    case "html": {
      const map: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      if (mode !== "decode") return input.replace(/[&<>"']/g, (c) => map[c]);
      return decodeHTMLStrict(input);
    }
    case "password":
      return password(input.trim() ? Number(input) : 20);
    case "counter":
      return JSON.stringify(
        {
          words: input.trim() ? input.trim().split(/\s+/u).length : 0,
          characters: Array.from(input).length,
          lines: input ? input.split("\n").length : 0,
          bytes: new TextEncoder().encode(input).length,
        },
        null,
        2,
      );
    case "case":
      return mode === "lower"
        ? input.toLowerCase()
        : mode === "title"
          ? input
              .toLowerCase()
              .replace(
                /(^|[^\p{L}\p{N}’'])(\p{L})/gu,
                (_, prefix, letter) => prefix + letter.toUpperCase(),
              )
          : mode === "slug"
            ? input
                .toLowerCase()
                .normalize("NFKD")
                .replace(/\p{M}+/gu, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")
            : input.toUpperCase();
    case "random":
      if (!input.trim() || !other.trim())
        throw Error("Enter both minimum and maximum integers.");
      return String(randomInt(Number(input), Number(other)));
    case "discord": {
      const n = Math.floor(new Date(input).getTime() / 1000);
      if (!Number.isFinite(n)) throw Error("Enter a date and time.");
      return `<t:${n}:${mode || "F"}>`;
    }
    case "snowflake": {
      if (!/^\d{15,20}$/.test(input))
        throw Error("Enter a 15–20 digit Discord ID.");
      const n = BigInt(input);
      if (n > 18446744073709551615n) throw Error("ID exceeds 64 bits.");
      return JSON.stringify(
        {
          created: new Date(Number((n >> 22n) + 1420070400000n)).toISOString(),
          worker: String((n >> 17n) & 31n),
          process: String((n >> 12n) & 31n),
          increment: String(n & 4095n),
        },
        null,
        2,
      );
    }
    case "colour": {
      const [r, g, b] = parseColour(input);
      const hex =
        "#" +
        [r, g, b]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
      const [rn, gn, bn] = [r / 255, g / 255, b / 255];
      const hi = Math.max(rn, gn, bn),
        lo = Math.min(rn, gn, bn),
        d = hi - lo,
        l = (hi + lo) / 2;
      let h = 0;
      if (d)
        h =
          (hi === rn
            ? (gn - bn) / d + (gn < bn ? 6 : 0)
            : hi === gn
              ? (bn - rn) / d + 2
              : (rn - gn) / d + 4) * 60;
      const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
      return `${hex}\nrgb(${r}, ${g}, ${b})\nhsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
    }
    default:
      throw Error("Unknown tool");
  }
}
export function download(content: Blob | string, name: string) {
  const url = URL.createObjectURL(
    typeof content === "string"
      ? new Blob([content], { type: "text/plain" })
      : content,
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
