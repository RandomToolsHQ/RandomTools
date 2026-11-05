import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { SignJWT } from "jose";
import {
  createGateway,
  gatewayOrigin,
  edgeURL,
  type GatewayEnv,
} from "../experiments/phase111/gateway";
import { digest } from "../worker/security";
const email = "phase11-00000000-member@example.com",
  key = "a".repeat(64),
  access = "b".repeat(64),
  app = "c".repeat(64),
  ts = () => Math.floor(Date.now() / 1000);
let gate: string;
export function gatewayFixture() {
  const first = vi.fn(async () => ({ count: 1 }));
  const env = {
    PHASE111_GATEWAY: "phase111-gateway-v1",
    STAGING_GATE_ORIGIN: gatewayOrigin,
    STAGING_GATE_SIGNING_KEY: key,
    STAGING_GATE_TESTERS: JSON.stringify([
      { email, keyHash: digest(app), expiresAt: ts() + 3600 },
    ]),
    POC_ACCESS_KEY: access,
    GATE_DB: {
      prepare: (sql: string) => ({
        first: sql.includes("poc_metadata")
          ? async () => "randomtools-phase111-gateway-v1"
          : first,
        bind() {
          return this;
        },
      }),
    },
    ASSETS: {
      fetch: async () =>
        new Response("<h1>Private test fixture</h1>", {
          headers: { "content-type": "text/html" },
        }),
    },
  } as unknown as GatewayEnv;
  return env;
}
beforeAll(async () => {
  gate = await new SignJWT({ keyHash: digest(app) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(gatewayOrigin)
    .setAudience("randomtools-private-staging")
    .setSubject(digest(email))
    .setIssuedAt(ts())
    .setExpirationTime(ts() + 1800)
    .sign(Uint8Array.from(key.match(/../g)!, (x) => parseInt(x, 16)));
});
afterEach(() => vi.restoreAllMocks());
const request = (
  path = "/api/phase11",
  headers: Record<string, string> = {},
  body = '{"operation":"me"}',
) =>
  new Request(gatewayOrigin + path, {
    method: "POST",
    headers: {
      origin: gatewayOrigin,
      "content-type": "application/json",
      authorization: "Bearer synthetic.fixture.token",
      cookie: "__Host-rt_staging=" + gate + "; __Host-rt_phase11=" + app,
      ...headers,
    },
    body,
  });
it("forwards only fixed destination and server-owned identity/key, stripping staging cookies", async () => {
  const upstream = vi.fn(async () =>
    Response.json({ user: { id: "synthetic" }, pro: true }),
  );
  const r = await createGateway(
    gatewayFixture(),
    upstream,
  )(
    request("/api/phase11", {
      "x-poc-access": "forged",
      "x-poc-tester": "forged",
      "x-private-secret": "not forwarded",
    }),
  );
  expect(r.status).toBe(200);
  expect(upstream).toHaveBeenCalledTimes(1);
  const [url, options] = upstream.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe(edgeURL);
  const h = new Headers(options.headers);
  expect(h.get("x-poc-access")).toBe(access);
  expect(h.get("x-poc-tester")).toBe(digest(email));
  expect(h.get("x-private-secret")).toBeNull();
  expect(h.get("cookie")).toBe("__Host-rt_phase11=" + app);
  expect(options.redirect).toBe("error");
  expect(r.headers.get("cache-control")).toContain("no-store");
});
it.each([
  ["cookie", "", 403],
  ["origin", "https://evil.example", 403],
  ["authorization", "", 401],
  ["content-type", "text/plain", 403],
])("denies %s without upstream request", async (name, value, status) => {
  const upstream = vi.fn();
  const r = await createGateway(
    gatewayFixture(),
    upstream,
  )(request("/api/phase11", { [String(name)]: String(value) }));
  expect(r.status).toBe(status);
  expect(upstream).not.toHaveBeenCalled();
});
it("blocks query/unknown routes, duplicate app cookies and oversized inputs", async () => {
  const upstream = vi.fn();
  const handle = createGateway(gatewayFixture(), upstream);
  expect(
    (await handle(request("/api/phase11?target=https://evil.example"))).status,
  ).toBe(403);
  expect((await handle(request("/api/else"))).status).toBe(404);
  expect(
    (await handle(request("/api/phase11", {}, "x".repeat(16385)))).status,
  ).toBe(413);
  expect(
    (
      await handle(
        request("/api/phase11", {
          cookie:
            "__Host-rt_staging=" +
            gate +
            "; __Host-rt_phase11=" +
            app +
            "; __Host-rt_phase11=" +
            app,
        }),
      )
    ).status,
  ).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
});
it.each([
  "__Host-rt_phase11=" +
    app +
    "; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=1800",
  "__Host-rt_phase11=" +
    app +
    "; Secure; SameSite=Strict; Path=/; Max-Age=1800",
  "__Host-rt_phase11=" +
    app +
    "; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800; Domain=pages.dev",
  "__Host-rt_phase11=" +
    app +
    "; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=9999",
  "other=secret; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800",
])("rejects unsafe upstream cookie %s", async (cookie) => {
  const r = await createGateway(gatewayFixture(), async () =>
    Response.json({}, { headers: { "set-cookie": cookie } }),
  )(request());
  expect(r.status).toBe(503);
  expect(r.headers.get("set-cookie")).toBeNull();
});
it("preserves secure first-party session cookie and explicit logout clearing", async () => {
  for (const cookie of [
    "__Host-rt_phase11=" +
      app +
      "; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800",
    "__Host-rt_phase11=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  ]) {
    const r = await createGateway(gatewayFixture(), async () =>
      Response.json(
        {},
        {
          headers: { "set-cookie": cookie, "access-control-allow-origin": "*" },
        },
      ),
    )(request());
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toBe(cookie);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  }
});
it("discards Supabase edge bot cookies while preserving the validated application cookie", async () => {
  const cookie =
    "__Host-rt_phase11=" +
    app +
    "; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800";
  const headers = new Headers();
  headers.append("set-cookie", cookie);
  headers.append(
    "set-cookie",
    "__cf_bm=synthetic; HttpOnly; SameSite=None; Secure; Path=/; Domain=supabase.co",
  );
  const response = await createGateway(gatewayFixture(), async () =>
    Response.json({}, { headers }),
  )(request());
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie()).toEqual([cookie]);
});
it("network errors, bad responses and wrong DB isolation fail closed", async () => {
  expect(
    (
      await createGateway(gatewayFixture(), async () => {
        throw Error("private upstream details");
      })(request())
    ).status,
  ).toBe(503);
  expect(
    (
      await createGateway(
        gatewayFixture(),
        async () => new Response("html"),
      )(request())
    ).status,
  ).toBe(503);
  const env = gatewayFixture();
  env.GATE_DB = {
    prepare: () => ({ first: async () => "randomtools-firebase-poc-v1" }),
  } as any;
  const upstream = vi.fn();
  expect((await createGateway(env, upstream)(request())).status).toBe(503);
  expect(upstream).not.toHaveBeenCalled();
});
