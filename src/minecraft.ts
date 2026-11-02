export const servers = [
  {
    id: "hypixel",
    name: "Hypixel",
    address: "mc.hypixel.net",
    edition: "java",
    region: "Unknown",
    country: "Unknown",
    category: "Minigames",
    authentication: "Official account required",
    source:
      "https://support.hypixel.net/hc/en-us/articles/360019495360-How-to-Join-the-Hypixel-Server",
  },
  {
    id: "cubecraft",
    name: "CubeCraft",
    address: "play.cubecraft.net",
    edition: "java",
    region: "Unknown",
    country: "Unknown",
    category: "Minigames",
    authentication: "Not verified",
    source:
      "https://help.cubecraft.net/en/article/how-do-i-join-cubecraft-java-edition-15kob0/",
  },
  ...[
    ["eu", "Europe"],
    ["na", "North America"],
    ["as", "Asia"],
  ].map(([route, region]) => ({
    id: `minemen-${route}`,
    name: `Minemen ${region} route`,
    address: `${route}.minemen.club`,
    edition: "java",
    region,
    country: "Unknown",
    category: "Unclassified",
    authentication: "Not verified",
    source: "https://store.minemen.club/login",
  })),
];
export function publicServerAddress(input: string) {
  const value = input.trim().toLowerCase();
  if (
    value.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$/.test(value)
  )
    throw Error("Enter a public hostname and optional port, not a URL.");
  const [host, port] = value.split(":");
  if (port && (+port < 1 || +port > 65535))
    throw Error("Port must be 1–65535.");
  if (
    !host.includes(".") ||
    host
      .split(".")
      .some(
        (x) => !x || x.length > 63 || x.startsWith("-") || x.endsWith("-"),
      ) ||
    /\.(?:localhost|local|internal|test|invalid)$/.test(host)
  )
    throw Error("Use a public DNS hostname.");
  // Hostnames only: avoid treating private/reserved IP addresses as public targets.
  if (/^[0-9.]+$/.test(host))
    throw Error("Use a public DNS hostname, not an IP address.");
  return value;
}
export type ServerStatus = {
  online: boolean;
  players?: number;
  max?: number;
  version?: string;
  checkedAt: number;
};
export function parseServerStatus(data: unknown): ServerStatus {
  if (
    !data ||
    typeof data !== "object" ||
    !("online" in data) ||
    typeof data.online !== "boolean"
  )
    throw Error("The status provider returned an unreadable response.");
  const d = data as {
    online: boolean;
    players?: { online?: unknown; max?: unknown };
    version?: { name_clean?: unknown; name?: unknown } | string;
  };
  const integer = (n: unknown) =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : undefined;
  const version =
    typeof d.version === "string" ? d.version : d.version?.name_clean;
  return {
    online: d.online,
    players: integer(d.players?.online),
    max: integer(d.players?.max),
    version: typeof version === "string" ? version.slice(0, 100) : undefined,
    checkedAt: Date.now(),
  };
}
const cache = new Map<string, ServerStatus>();
let nextAllowed = 0;
let pending = false;
export async function serverStatus(
  address: string,
  edition: "java" | "bedrock",
  fetcher: typeof fetch = fetch,
) {
  const host = publicServerAddress(address);
  if (!["java", "bedrock"].includes(edition)) throw Error("Unknown edition.");
  const key = `${edition}/${host}`,
    old = cache.get(key);
  if (old && Date.now() - old.checkedAt < 60000) return old;
  if (pending || Date.now() < nextAllowed)
    throw Error(
      "Please wait before another status lookup. No automatic polling is performed.",
    );
  pending = true;
  nextAllowed = Date.now() + 1000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(
      `https://api.mcstatus.io/v2/status/${edition}/${encodeURIComponent(host)}`,
      {
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );
    if (response.status === 429) {
      const retry = Number(response.headers.get("Retry-After"));
      nextAllowed =
        Date.now() +
        Math.min(3600, Math.max(60, Number.isFinite(retry) ? retry : 60)) *
          1000;
      throw Error(
        "The provider rate limit was reached. Wait at least a minute before trying again.",
      );
    }
    if (!response.ok)
      throw Error(`Status provider unavailable (${response.status}).`);
    const result = parseServerStatus(await response.json());
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError")
      throw Error("Status lookup timed out. Server status is unknown.", {
        cause: e,
      });
    throw e;
  } finally {
    clearTimeout(timeout);
    pending = false;
  }
}
