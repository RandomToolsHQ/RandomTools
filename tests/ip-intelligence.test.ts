import {
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import {
  publicIp,
  normalizeIpResult,
  fetchIpIntelligence,
  ipIntelligenceRoute,
} from "../worker/ip-intelligence";
import { exportIpIntelligence } from "../src/ip-intelligence-export";
const provider = {
  ipAddress: "1.1.1.1",
  countryName: "Australia",
  countryCode: "AU",
  cityName: "Sydney",
  regionName: "NSW",
  latitude: -33.8,
  longitude: 151.2,
  timeZones: ["Australia/Sydney", "Australia/Perth"],
  asn: "13335",
  asnOrganization: "Cloudflare",
  isProxy: false,
};
it.each([
  "0.0.0.0",
  "10.0.0.1",
  "127.0.0.1",
  "169.254.169.254",
  "172.16.0.1",
  "192.168.1.1",
  "100.64.0.1",
  "192.0.0.9",
  "192.0.2.1",
  "198.18.0.1",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
  "255.255.255.255",
  "::",
  "::1",
  "fe80::1",
  "fc00::1",
  "::ffff:127.0.0.1",
  "::ffff:7f00:1",
  "64:ff9b::a00:1",
  "2001:db8::1",
  "2001::1",
  "2002:7f00:1::",
  "3fff::1",
  "5f00::1",
  "example.com",
  "https://1.1.1.1",
  "1.1.1.1:80",
  "[2606:4700::1111]",
  "1.1.1.1/32",
  "001.1.1.1",
  "0x7f000001",
  "2130706433",
  "fe80::1%eth0",
  "1.1.1.1?url=http://localhost",
  " 1.1.1.1",
  "1.1.1.999",
])("rejects private/reserved or nonliteral input %s", (input) =>
  expect(() => publicIp(input)).toThrow(),
);
it("accepts and canonicalizes globally routable IPv4 and IPv6 only", () => {
  expect(publicIp("8.8.8.8")).toBe("8.8.8.8");
  expect(publicIp("2606:4700:4700:0:0:0:0:1111")).toBe("2606:4700:4700::1111");
});
it("preserves unsupported fields as unavailable and attributes indicators/country timezones", () => {
  const d = normalizeIpResult(provider, "1.1.1.1");
  expect(d).toMatchObject({
    asn: "AS13335",
    isp: null,
    organization: null,
    timezone: null,
    indicators: { proxy: false, vpn: null, hosting: null },
  });
  expect(d.countryTimezones).toHaveLength(2);
  const missing = normalizeIpResult({ ipAddress: "1.1.1.1" }, "1.1.1.1");
  expect(missing.country).toBeNull();
  expect(missing.indicators.proxy).toBeNull();
  expect(normalizeIpResult({ ...provider, asn: 0 }, "1.1.1.1").asn).toBeNull();
  expect(() =>
    normalizeIpResult({ ...provider, asn: "9999999999" }, "1.1.1.1"),
  ).toThrow();
});
it("exports real normalized fields, uncertainty and attribution without inventing missing data", () => {
  const data = normalizeIpResult(provider, "1.1.1.1");
  expect(JSON.parse(exportIpIntelligence(data, "json"))).toEqual(data);
  const txt = exportIpIntelligence(data, "txt");
  expect(txt).toContain("ISP: Unavailable");
  expect(txt).toContain("not a physical address");
  expect(txt).toContain("https://freeipapi.com");
  expect(txt).toContain("Proxy indicator (FreeIPAPI): false");
});
let mf: Miniflare, db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('synthetic')}}",
      d1Databases: ["DB"],
    }),
  );
  db = await mf.getD1Database("DB");
  for (const f of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("migrations/" + f, "utf8"));
});
afterAll(async () => await mf?.dispose());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(async () => {
  await db.exec("DELETE FROM users; DELETE FROM rate_limits;");
  for (const [id, role] of [
    ["member", "free"],
    ["other", "free"],
    ["admin", "admin"],
  ])
    await db
      .prepare("INSERT INTO users VALUES(?,?,?,'synthetic',?,1,0,1)")
      .bind(id, id + "@example.test", id, role)
      .run();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => Response.json(provider)),
  );
});
const env = () => ({
  DB: db,
  APP_ORIGIN: "https://private.example.test",
  IP_LOOKUP_ENABLED: "true",
});
const call = (
  actor = "admin",
  body: unknown = { ip: "1.1.1.1", consent: true },
  headers: Record<string, string> = {},
) =>
  ipIntelligenceRoute(
    new Request("https://private.example.test/api/pro/ip-lookup", {
      method: "POST",
      headers: {
        origin: "https://private.example.test",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    env(),
    { id: actor, role: "admin" },
  );
it("reads fresh D1 Pro, expiry, revocation, disabled state and admin role rather than trusting client roles", async () => {
  expect((await call("member")).status).toBe(403);
  expect((await call("missing")).status).toBe(403);
  const ts = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      "INSERT INTO pro_grants(id,user_id,duration,expires_at,granted_at) VALUES('grant','member','7d',?,1)",
    )
    .bind(ts + 30)
    .run();
  expect((await call("member")).status).toBe(200);
  await db
    .prepare("UPDATE pro_grants SET expires_at=? WHERE id='grant'")
    .bind(ts - 1)
    .run();
  expect((await call("member")).status).toBe(403);
  await db
    .prepare("UPDATE pro_grants SET expires_at=?,revoked_at=? WHERE id='grant'")
    .bind(ts + 60, ts)
    .run();
  expect((await call("member")).status).toBe(403);
  expect((await call("other")).status).toBe(403);
  expect((await call("admin")).status).toBe(200);
  await db.exec("UPDATE users SET role='free' WHERE id='admin';");
  expect((await call("admin")).status).toBe(403);
  await db.exec("UPDATE users SET role='admin',disabled=1 WHERE id='admin';");
  expect((await call("admin")).status).toBe(403);
});
it("rejects consent bypass, CSRF, unapproved methods, oversized/invalid input and feature-disabled environments without outbound calls", async () => {
  for (const body of [
    { ip: "1.1.1.1", consent: false },
    { ip: "1.1.1.1", consent: true, url: "http://localhost" },
    { ip: "127.0.0.1", consent: true },
  ])
    expect([400, 413]).toContain((await call("admin", body)).status);
  expect(
    (await call("admin", undefined, { origin: "https://attacker.test" }))
      .status,
  ).toBe(403);
  const req = new Request("https://private.example.test/api/pro/ip-lookup");
  expect(
    (await ipIntelligenceRoute(req, env(), { id: "admin", role: "admin" }))
      .status,
  ).toBe(405);
  expect(
    (
      await ipIntelligenceRoute(
        new Request(req, {
          method: "POST",
          headers: {
            origin: env().APP_ORIGIN,
            "content-type": "application/json",
          },
          body: "{}",
        }),
        { ...env(), IP_LOOKUP_ENABLED: "false" },
        { id: "admin", role: "admin" },
      )
    ).status,
  ).toBe(503);
  expect(
    (await call("admin", { ip: "a".repeat(300), consent: true })).status,
  ).toBe(413);
  expect(fetch).not.toHaveBeenCalled();
});
it("uses only the fixed free HTTPS provider and never persists searched IPs/results", async () => {
  const r = await call();
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(fetch).toHaveBeenCalledWith(
    "https://free.freeipapi.com/api/v1/json/1.1.1.1",
    expect.objectContaining({
      redirect: "error",
      signal: expect.any(AbortSignal),
    }),
  );
  const keys = await db.prepare("SELECT key FROM rate_limits").all();
  expect(JSON.stringify(keys.results)).not.toContain("1.1.1.1");
  expect(
    await db.prepare("SELECT count(*) n FROM tool_history").first("n"),
  ).toBe(0);
});
it("enforces per-user/shared budgets and provider cooldown with safe retry hints", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 4, 2, 0, 1));
  for (let i = 0; i < 3; i++) expect((await call()).status).toBe(200);
  const limited = await call();
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(fetch).toHaveBeenCalledTimes(3);
  await db.exec("DELETE FROM rate_limits;");
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status: 429 }));
  const providerLimited = await call();
  expect(providerLimited.status).toBe(503);
  expect(providerLimited.headers.get("retry-after")).toBe("60");
  expect((await call()).status).toBe(503);
  expect(fetch).toHaveBeenCalledTimes(4);
  await db.exec(
    "DELETE FROM rate_limits; INSERT INTO rate_limits VALUES('ip-lookup:burst',5,9999999999);",
  );
  expect((await call()).status).toBe(429);
  expect(fetch).toHaveBeenCalledTimes(4);
});
it("resets the fixed user budget only after its window expires", async () => {
  const start = Date.UTC(2026, 10, 4, 2, 0, 1);
  const clock = vi.spyOn(Date, "now").mockReturnValue(start);
  for (let i = 0; i < 3; i++) expect((await call()).status).toBe(200);
  expect((await call()).status).toBe(429);
  clock.mockReturnValue(start + 60000);
  expect((await call()).status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(4);
});
it("fails safely on timeouts, oversized bodies, malformed JSON, mismatched IPs and invalid provider attributes", async () => {
  for (const data of [
    { ...provider, ipAddress: "8.8.8.8" },
    { ...provider, latitude: 100 },
    { ...provider, isProxy: "true" },
    [],
    null,
  ]) {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(data));
    await expect(fetchIpIntelligence("1.1.1.1")).rejects.toThrow();
  }
  vi.mocked(fetch).mockRejectedValueOnce(
    Error("PRIVATE_TOKEN_PROVIDER_DIAGNOSTIC"),
  );
  await expect(fetchIpIntelligence("1.1.1.1")).rejects.toThrow(
    "did not return usable data",
  );
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response("{invalid", {
      headers: { "content-type": "application/json" },
    }),
  );
  await expect(fetchIpIntelligence("1.1.1.1")).rejects.toThrow(
    "did not return usable data",
  );
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ ...provider, padding: "x".repeat(40000) }),
  );
  await expect(fetchIpIntelligence("1.1.1.1")).rejects.toThrow(
    "did not return usable data",
  );
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response("secret redirect", {
      status: 302,
      headers: { location: "http://127.0.0.1" },
    }),
  );
  await expect(fetchIpIntelligence("1.1.1.1")).rejects.toThrow("unavailable");
});
