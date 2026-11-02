import { randomInt } from "./engines";
export const characterSets = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{}:,.?",
};
export function bounded(
  value: number,
  min: number,
  max: number,
  label: string,
) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw Error(`${label} must be an integer from ${min}–${max}.`);
}
const pick = <T>(list: readonly T[]) => list[randomInt(0, list.length - 1)];
export type PasswordOptions = {
  length: number;
  count: number;
  sets: (keyof typeof characterSets)[];
  custom?: string;
  excludeAmbiguous?: boolean;
};
export function passwordBatch(o: PasswordOptions) {
  bounded(o.length, 8, 128, "Password length");
  bounded(o.count, 1, 50, "Count");
  let groups = o.custom
    ? [o.custom]
    : [...new Set(o.sets)].map((s) => characterSets[s]);
  if (groups.some((g) => typeof g !== "string"))
    throw Error("Invalid character set.");
  if (o.excludeAmbiguous)
    groups = groups.map((g) => g.replace(/[Il1O0o]/g, ""));
  const alphabet = [...new Set(Array.from(groups.join("")))];
  if (
    !groups.length ||
    groups.some((g) => !g.length) ||
    alphabet.length < 2 ||
    alphabet.length > 128 ||
    alphabet.some((c) => /\s|\p{C}/u.test(c))
  )
    throw Error(
      "Choose at least two distinct, visible characters (maximum 128).",
    );
  // Uniform CSPRNG strings conditioned on containing each selected group.
  const values: string[] = [];
  for (let i = 0; i < o.count; i++) {
    let accepted = false;
    for (let attempt = 0; attempt < 1000; attempt++) {
      const chars = Array.from({ length: o.length }, () => pick(alphabet));
      if (groups.every((g) => chars.some((c) => Array.from(g).includes(c)))) {
        values.push(chars.join(""));
        accepted = true;
        break;
      }
    }
    if (!accepted)
      throw Error(
        "Could not satisfy the character constraints. Try a longer password.",
      );
  }
  // Inclusion/exclusion counts the constrained output space, including overlap.
  let count = 0n;
  for (let mask = 0; mask < 2 ** groups.length; mask++) {
    const removed = new Set<string>();
    let parity = 0;
    for (let g = 0; g < groups.length; g++)
      if (mask & (1 << g)) {
        parity++;
        Array.from(groups[g]).forEach((c) => removed.add(c));
      }
    const size = alphabet.filter((c) => !removed.has(c)).length;
    count += (parity % 2 ? -1n : 1n) * BigInt(size) ** BigInt(o.length);
  }
  return { values, entropyBits: Math.log2(Number(count)) };
}
export async function passphraseBatch(
  words: number,
  count: number,
  separator: string,
) {
  bounded(words, 4, 12, "Words");
  bounded(count, 1, 50, "Count");
  if (!["-", " ", "_", "."].includes(separator))
    throw Error("Invalid word separator.");
  const { effWords } = await import("./passphrase-words");
  return {
    values: Array.from({ length: count }, () =>
      Array.from({ length: words }, () => pick(effWords)).join(separator),
    ),
    entropyBits: words * Math.log2(effWords.length),
  };
}
const themes = {
  random: [
    "Nova",
    "Orbit",
    "Pixel",
    "Echo",
    "Comet",
    "Cloud",
    "Lunar",
    "River",
  ],
  aesthetic: [
    "Velvet",
    "Bloom",
    "Misty",
    "Lily",
    "Aura",
    "Pearl",
    "Dusk",
    "Meadow",
  ],
  gaming: [
    "Quest",
    "Combo",
    "Dash",
    "Level",
    "Spawn",
    "Arcade",
    "Craft",
    "Rally",
  ],
  nature: [
    "Cedar",
    "Maple",
    "Willow",
    "Otter",
    "Falcon",
    "Reef",
    "Birch",
    "Rain",
  ],
};
export function usernames(o: {
  length: number;
  count: number;
  theme: keyof typeof themes;
  format: "mixed" | "lower" | "underscore";
  prefix: string;
}) {
  bounded(o.length, 3, 20, "Username length");
  bounded(o.count, 1, 100, "Count");
  if (
    !themes[o.theme] ||
    !["mixed", "lower", "underscore"].includes(o.format) ||
    !/^([A-Za-z][A-Za-z0-9]{0,10})?$/.test(o.prefix) ||
    o.prefix.length >= o.length
  )
    throw Error(
      "Use a letter/number prefix shorter than the username (maximum 11).",
    );
  const out = new Set<string>();
  for (let attempt = 0; attempt < 5000 && out.size < o.count; attempt++) {
    const word = o.theme === "random" ? "" : pick(themes[o.theme]);
    let value = (o.prefix + word).slice(
      0,
      Math.max(o.prefix.length, o.length - 4),
    );
    while (value.length < o.length)
      value += pick("abcdefghijklmnopqrstuvwxyz0123456789".split(""));
    if (o.format === "underscore") {
      if (o.prefix.length > o.length - 2)
        throw Error(
          "Leave at least two characters after the prefix for an internal underscore.",
        );
      const pos = randomInt(Math.max(1, o.prefix.length), value.length - 2);
      value = value.slice(0, pos) + "_" + value.slice(pos + 1);
    }
    if (o.format === "lower") value = value.toLowerCase();
    out.add(value);
  }
  if (out.size !== o.count)
    throw Error(
      "Too many names for this prefix/length. Increase length or reduce count.",
    );
  return [...out];
}
export function fictionalProfiles(o: {
  count: number;
  domain: string;
  format: string;
}) {
  bounded(o.count, 1, 100, "Count");
  const domain = o.domain.toLowerCase().trim();
  if (
    domain.length > 100 ||
    !/^(?:[a-z0-9-]+\.)*(?:example\.(?:com|net|org)|invalid|test)$/.test(domain)
  )
    throw Error(
      "Use example.com/.net/.org or a reserved .invalid/.test domain, never a real inbox domain.",
    );
  if (
    o.format.length > 80 ||
    !o.format ||
    /[^a-zA-Z0-9._+{}-]/.test(o.format) ||
    o.format.replace(/\{(?:first|last|n|username)\}/g, "").includes("{")
  )
    throw Error(
      "Use {first}, {last}, {n}, {username}, letters, digits, dots, +, _ or -.",
    );
  return Array.from({ length: o.count }, (_, i) => {
    const first = pick([
        "Avery",
        "Rowan",
        "Alex",
        "Morgan",
        "Riley",
        "Skyler",
        "Casey",
        "Taylor",
      ]),
      last = pick([
        "Vale",
        "Brook",
        "Reed",
        "Finch",
        "Lake",
        "Grove",
        "Stone",
        "Field",
      ]);
    const username = `test${randomInt(100000, 999999)}${i + 1}`;
    const local = o.format.replace(
      /\{(first|last|n|username)\}/g,
      (_, key) =>
        ({
          first: first.toLowerCase(),
          last: last.toLowerCase(),
          n: String(i + 1),
          username,
        })[key as "first"],
    );
    if (
      local.length > 64 ||
      !/^[a-zA-Z0-9_+-]+(?:\.[a-zA-Z0-9_+-]+)*$/.test(local)
    )
      throw Error("The email format produced an invalid local part.");
    return {
      id: crypto.randomUUID(),
      fictional: true,
      firstName: first,
      lastName: last,
      displayName: `Test ${first} ${last}`,
      username,
      email: `${local}@${domain}`,
    };
  });
}
export function profilesCsv(profiles: ReturnType<typeof fictionalProfiles>) {
  const fields = [
    "id",
    "fictional",
    "firstName",
    "lastName",
    "displayName",
    "username",
    "email",
  ] as const;
  const cell = (v: unknown) =>
    '"' +
    String(v)
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    fields.join(","),
    ...profiles.map((p) => fields.map((f) => cell(p[f])).join(",")),
  ].join("\r\n");
}
