import { test, expect } from "@playwright/test";
import { createGateway, gatewayOrigin, type GatewayEnv } from "../gateway";
import { digest } from "../../../worker/security";
// All networking is intercepted. These test browser cookies and the real named
// HMAC staging gate, NOT real Firebase authentication, TLS or hosted API flows.
test("secure first-party cookies, named identity, persistence, cross-site protection and logout", async ({
  page,
  context,
}) => {
  const email = "phase11-00000000-member@example.com",
    raw = "c".repeat(64),
    app = "d".repeat(64);
  const seen: Array<{
    operation: string;
    cookie: string;
    tester: string;
    key: string;
  }> = [];
  const navigationCookies: string[] = [];
  let formOrigin: string | undefined;
  const env = {
    PHASE111_GATEWAY: "phase111-gateway-v1",
    STAGING_GATE_ORIGIN: gatewayOrigin,
    STAGING_GATE_SIGNING_KEY: "a".repeat(64),
    STAGING_GATE_TESTERS: JSON.stringify([
      {
        email,
        keyHash: digest(raw),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
    ]),
    POC_ACCESS_KEY: "b".repeat(64),
    GATE_DB: {
      prepare: (sql: string) => ({
        bind() {
          return this;
        },
        first: async () =>
          sql.includes("poc_metadata")
            ? "randomtools-phase111-gateway-v1"
            : { count: 1 },
      }),
    },
    ASSETS: {
      fetch: async () =>
        new Response(
          '<!doctype html><html lang="en"><title>Local fixture</title><h1>Restricted test fixture</h1></html>',
          { headers: { "content-type": "text/html" } },
        ),
    },
  } as unknown as GatewayEnv;
  const handler = createGateway(env, async (_url, options) => {
    const h = new Headers(options?.headers),
      body = JSON.parse(String(options?.body));
    seen.push({
      operation: body.operation,
      cookie: h.get("cookie") || "",
      tester: h.get("x-poc-tester") || "",
      key: h.get("x-poc-access") || "",
    });
    const headers: Record<string, string> = {};
    if (
      body.operation === "me" &&
      h.get("cookie") !== "__Host-rt_phase11=" + app
    )
      return Response.json(
        { error: "Synthetic fixture session required" },
        { status: 401 },
      );
    if (body.operation === "session")
      headers["set-cookie"] =
        "__Host-rt_phase11=" +
        app +
        "; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800";
    if (body.operation === "logout")
      headers["set-cookie"] =
        "__Host-rt_phase11=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0";
    return Response.json({ syntheticFixture: true }, { headers });
  });
  const other = "https://phase111-cross-site.example.test";
  await page.route("**/*", async (route) => {
    const r = route.request(),
      url = new URL(r.url());
    if (url.origin === other) {
      await route.fulfill({
        contentType: "text/html",
        body: `<a href="${gatewayOrigin}/">Return to restricted fixture</a>`,
      });
      return;
    }
    if (url.origin !== gatewayOrigin) {
      await route.abort();
      return;
    }
    const headers = await r.allHeaders();
    if (r.method() === "POST" && url.pathname === "/__staging")
      formOrigin = headers.origin;
    if (r.method() === "GET" && url.pathname === "/")
      navigationCookies.push(headers.cookie || "");
    const req = new Request(r.url(), {
      method: r.method(),
      headers,
      body:
        r.method() === "GET" || r.method() === "HEAD"
          ? undefined
          : r.postData(),
    });
    const response = await handler(req);
    if (response.status === 303) {
      // Playwright route interception does not cover automatic redirect chains.
      // Assert the real redirect and cookie, then follow it as a new intercepted
      // navigation below; never contact the unprovisioned hosted origin.
      expect(response.headers.get("location")).toBe("/");
      expect(response.headers.getSetCookie()).toHaveLength(1);
      await route.fulfill({
        status: 200,
        headers: {
          ...Object.fromEntries(response.headers),
          "content-type": "text/html",
        },
        body: "<h1>Local redirect transport</h1>",
      });
      return;
    }
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  const denied = await page.goto(gatewayOrigin + "/");
  expect(denied?.status()).toBe(403);
  await page.goto(gatewayOrigin + "/__staging");
  await page.getByLabel("Approved tester email").fill(email);
  await page.getByLabel("Staging access key").fill(raw);
  await page.getByRole("button", { name: "Enter private staging" }).click();
  expect(
    formOrigin,
    "Native form submission must retain its exact origin",
  ).toBe(gatewayOrigin);
  await page.goto(gatewayOrigin + "/");
  await expect(
    page.getByRole("heading", { name: "Restricted test fixture" }),
  ).toBeVisible();
  const call = (operation: string) =>
    page.evaluate(async (op) => {
      const r = await fetch("/api/phase11", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer synthetic.fixture.token",
          "x-poc-access": "browser-forgery",
          "x-poc-tester": "browser-forgery",
        },
        body: JSON.stringify({ operation: op }),
      });
      return { status: r.status, cookie: r.headers.get("set-cookie") };
    }, operation);
  expect(await call("session")).toEqual({ status: 200, cookie: null });
  const stored = (await context.cookies(gatewayOrigin)).find(
    (c) => c.name === "__Host-rt_phase11",
  );
  expect(stored).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    value: app,
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain(app);
  await page.reload();
  expect((await call("me")).status).toBe(200);
  expect(seen.at(-1)).toMatchObject({
    cookie: "__Host-rt_phase11=" + app,
    tester: digest(email),
    key: "b".repeat(64),
  });
  expect(seen.every((x) => !x.cookie.includes("__Host-rt_staging"))).toBe(true);
  await page.goto(other);
  await page
    .getByRole("link", { name: "Return to restricted fixture" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Restricted test fixture" }),
  ).toBeVisible();
  expect(navigationCookies.at(-1)).not.toContain("__Host-rt_phase11");
  expect((await call("logout")).status).toBe(200);
  expect(
    (await context.cookies(gatewayOrigin)).some(
      (c) => c.name === "__Host-rt_phase11",
    ),
  ).toBe(false);
  expect((await call("me")).status).toBe(401);
});
