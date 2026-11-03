import ipaddr from "ipaddr.js";
import { z } from "zod";
import { readBody, BodyTooLarge } from "./body";
import { hasPro } from "./pro-access";
import { now } from "./security";

export class IpLookupError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function publicIp(input: string): string {
  if (
    typeof input !== "string" ||
    input.length > 45 ||
    input !== input.trim() ||
    (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(input) &&
      !/^[0-9a-fA-F:]+$/.test(input))
  )
    throw new IpLookupError(
      400,
      "Enter one public IPv4 or IPv6 address, without a URL, port or network prefix.",
    );
  let address;
  try {
    address = ipaddr.parse(input);
  } catch {
    throw new IpLookupError(400, "Enter a valid IP address.");
  }
  if (address.range() !== "unicast")
    throw new IpLookupError(
      400,
      "Private, reserved and special-purpose IP addresses are not supported.",
    );
  if (address.kind() === "ipv6") {
    const v6 = address as ipaddr.IPv6;
    if (
      !v6.match(ipaddr.IPv6.parse("2000::"), 3) ||
      v6.match(ipaddr.IPv6.parse("2001::"), 23) ||
      v6.match(ipaddr.IPv6.parse("2001:db8::"), 32) ||
      v6.match(ipaddr.IPv6.parse("2002::"), 16) ||
      v6.match(ipaddr.IPv6.parse("3fff::"), 20)
    )
      throw new IpLookupError(
        400,
        "Private, reserved and special-purpose IP addresses are not supported.",
      );
  }
  return address.toString();
}
const field = z.string().max(160).nullable().optional();
const providerSchema = z.object({
  ipAddress: z.string().max(45),
  countryName: field,
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  regionName: field,
  cityName: field,
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  timeZones: z.array(z.string().max(80)).max(32).nullable().optional(),
  asn: z
    .union([
      z
        .string()
        .regex(/^\d{1,10}$/)
        .refine((v) => Number(v) <= 4294967295),
      z.number().int().min(0).max(4294967295),
    ])
    .nullable()
    .optional(),
  asnOrganization: field,
  isProxy: z.boolean().nullable().optional(),
});
export type IpIntelligence = {
  ip: string;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: null;
  countryTimezones: string[];
  isp: null;
  organization: null;
  asn: string | null;
  asnOrganization: string | null;
  indicators: { proxy: boolean | null; vpn: null; hosting: null };
  provider: "FreeIPAPI";
  attribution: string;
  notice: string;
};
export function normalizeIpResult(
  raw: unknown,
  expected: string,
): IpIntelligence {
  const parsed = providerSchema.safeParse(raw);
  if (!parsed.success)
    throw new IpLookupError(
      502,
      "The lookup provider returned an invalid response.",
    );
  const d = parsed.data;
  let returned;
  try {
    returned = publicIp(d.ipAddress);
  } catch {
    throw new IpLookupError(
      502,
      "The lookup provider returned an invalid response.",
    );
  }
  if (returned !== expected)
    throw new IpLookupError(
      502,
      "The lookup provider returned a different address.",
    );
  const text = (v: string | null | undefined) => v?.trim() || null;
  return {
    ip: expected,
    country: text(d.countryName),
    countryCode: d.countryCode ?? null,
    region: text(d.regionName),
    city: text(d.cityName),
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
    timezone: null,
    countryTimezones: d.timeZones ?? [],
    isp: null,
    organization: null,
    asn: d.asn == null || Number(d.asn) === 0 ? null : "AS" + String(d.asn),
    asnOrganization: text(d.asnOrganization),
    indicators: { proxy: d.isProxy ?? null, vpn: null, hosting: null },
    provider: "FreeIPAPI",
    attribution: "IP data from FreeIPAPI — https://freeipapi.com",
    notice:
      "Approximate network location, not a physical address. Provider indicators are not proof of VPN, proxy or hosting use. Missing fields are unavailable. Timezone candidates apply to the country, not necessarily this IP.",
  };
}
export async function fetchIpIntelligence(ip: string): Promise<IpIntelligence> {
  // Fixed free endpoint only. No request headers, cookies, hostnames or secrets
  // supplied by the user are forwarded, and redirects are never followed.
  const canonical = publicIp(ip);
  try {
    const response = await fetch(
      "https://free.freeipapi.com/api/v1/json/" + encodeURIComponent(canonical),
      {
        redirect: "error",
        signal: AbortSignal.timeout(3500),
        headers: { accept: "application/json" },
        cache: "no-store",
      },
    );
    if (response.status === 429) {
      await response.body?.cancel();
      throw new IpLookupError(
        503,
        "The lookup provider is rate limited. Try again later.",
        60,
      );
    }
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    ) {
      await response.body?.cancel();
      throw new IpLookupError(
        502,
        "The lookup provider is unavailable. Try again later.",
      );
    }
    const body = await readBody(response, 32768);
    return normalizeIpResult(JSON.parse(body), canonical);
  } catch (error) {
    if (error instanceof IpLookupError) throw error;
    throw new IpLookupError(
      502,
      "The lookup provider did not return usable data. Try again later.",
    );
  }
}
type Env = { DB: D1Database; APP_ORIGIN: string; IP_LOOKUP_ENABLED?: string };
async function limit(env: Env, key: string, maximum: number, seconds: number) {
  const ts = now(),
    expiry = (Math.floor(ts / seconds) + 1) * seconds;
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count",
  )
    .bind(key, expiry, ts, ts)
    .first<{ count: number }>();
  if (!row || row.count > maximum)
    throw new IpLookupError(
      429,
      "Lookup limit reached. Try again later.",
      expiry - ts,
    );
}
export async function ipIntelligenceRoute(
  req: Request,
  env: Env,
  user: { id: string; role: string },
) {
  try {
    if (!(await hasPro(env, user)))
      throw new IpLookupError(403, "Active Pro access is required.");
    if (req.method !== "POST")
      throw new IpLookupError(405, "Use POST for an IP lookup.");
    if (
      req.headers.get("origin") !== env.APP_ORIGIN ||
      req.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      throw new IpLookupError(403, "Request origin rejected.");
    if (env.IP_LOOKUP_ENABLED !== "true")
      throw new IpLookupError(
        503,
        "IP lookups are not enabled in this environment.",
      );
    const body = z
      .object({ ip: z.string().max(45), consent: z.literal(true) })
      .strict()
      .parse(JSON.parse(await readBody(req, 256)));
    const ip = publicIp(body.ip);
    const cooldown = await env.DB.prepare(
      "SELECT expires_at FROM rate_limits WHERE key='ip-lookup:cooldown' AND expires_at>?",
    )
      .bind(now())
      .first();
    if (cooldown)
      throw new IpLookupError(
        503,
        "The lookup provider is rate limited. Try again later.",
        60,
      );
    await limit(env, "ip-lookup:user:" + user.id, 3, 60);
    await limit(env, "ip-lookup:burst", 5, 10);
    await limit(env, "ip-lookup:minute", 30, 60);
    let data;
    try {
      data = await fetchIpIntelligence(ip);
    } catch (error) {
      if (error instanceof IpLookupError && error.retryAfter) {
        await env.DB.prepare(
          "INSERT INTO rate_limits VALUES('ip-lookup:cooldown',1,?) ON CONFLICT(key) DO UPDATE SET expires_at=max(expires_at,excluded.expires_at)",
        )
          .bind(now() + 60)
          .run();
      }
      throw error;
    }
    return Response.json(data, {
      headers: {
        "cache-control": "private, no-store",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (error) {
    const status =
      error instanceof IpLookupError
        ? error.status
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 400
          : error instanceof BodyTooLarge
            ? 413
            : 503;
    return Response.json(
      {
        error:
          error instanceof IpLookupError
            ? error.message
            : status === 400
              ? "Enter a valid IP and confirm provider disclosure."
              : "IP lookup is unavailable. Try again later.",
      },
      {
        status,
        headers: {
          "cache-control": "private, no-store",
          ...(error instanceof IpLookupError && error.retryAfter
            ? { "retry-after": String(error.retryAfter) }
            : {}),
        },
      },
    );
  }
}
