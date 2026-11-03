import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const encode = (v: object) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
const fixtureToken = () =>
  encode({ alg: "RS256" }) +
  "." +
  encode({
    sub: "synthetic-browser",
    aud: "demo-randomtools-poc",
    iss: "https://securetoken.google.com/demo-randomtools-poc",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    auth_time: Math.floor(Date.now() / 1000),
    email_verified: true,
  }) +
  ".synthetic-signature";
// UI fixtures only: live Google requests are intercepted. Crypto/DB checks are
// separately exercised by firebase-poc.test.ts and hosted tests where authorized.
test.beforeEach(async ({ page }) => {
  await page.route("**/identitytoolkit.googleapis.com/**", async (route) => {
    const url = route.request().url();
    let body: any = {};
    try {
      body = route.request().postDataJSON();
    } catch {
      /* GET project config */
    }
    if (
      url.includes("accounts:signInWithPassword") ||
      url.includes("accounts:signUp")
    )
      return route.fulfill({
        json: {
          localId: "synthetic-browser",
          email: body.email,
          idToken: fixtureToken(),
          refreshToken: "synthetic-refresh-token",
          expiresIn: "3600",
          registered: true,
        },
      });
    if (url.includes("accounts:lookup"))
      return route.fulfill({
        json: {
          users: [
            {
              localId: "synthetic-browser",
              email: "synthetic@example.test",
              emailVerified: true,
              validSince: "1",
              providerUserInfo: [
                { providerId: "password", email: "synthetic@example.test" },
              ],
              createdAt: "1",
              lastLoginAt: "1",
            },
          ],
        },
      });
    if (url.includes("/projects"))
      return route.fulfill({ json: { authorizedDomains: ["localhost"] } });
    return route.fulfill({ json: { email: "synthetic@example.test" } });
  });
  await page.route("**/securetoken.googleapis.com/**", (r) =>
    r.fulfill({
      json: {
        access_token: fixtureToken(),
        expires_in: "3600",
        refresh_token: "synthetic-refresh-token",
        token_type: "Bearer",
        user_id: "synthetic-browser",
        project_id: "demo-randomtools-poc",
      },
    }),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me")
      return route.fulfill({
        json: {
          user: {
            id: "synthetic-member",
            name: "Synthetic member",
            role: "free",
          },
          pro: false,
        },
      });
    if (path === "/api/pro-access")
      return route.fulfill({ json: { requests: [], grants: [], pro: false } });
    return route.fulfill({ json: { message: "Synthetic operation complete" } });
  });
});
test("private account forms are accessible and recovery requests do not reveal membership", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Firebase account testing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with Google" }),
  ).toBeVisible();
  await page.getByLabel("Recovery email").fill("synthetic@example.test");
  await page
    .getByRole("button", { name: "Send recovery instructions" })
    .click();
  await expect(page.getByRole("status")).toContainText("If eligible");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("existing synthetic credentials connect to a server-authorized session and logout calls the server", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Test email", { exact: true })
    .fill("synthetic@example.test");
  await page
    .getByLabel("Test password", { exact: true })
    .fill("existing synthetic fixture password");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByRole("button", { name: "Connect private workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic member · Free" }),
  ).toBeVisible();
  const logout = page.waitForRequest(
    (r) => r.url().endsWith("/api/logout") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await logout;
  await expect(
    page.getByRole("heading", { name: "Sign in or register" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("firebase:authUser")),
    ),
  ).toBe(false);
});
test("provider outages stay visible and never manufacture a Pro workspace", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Test email", { exact: true })
    .fill("synthetic@example.test");
  await page
    .getByLabel("Test password", { exact: true })
    .fill("existing synthetic fixture password");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.route("**/api/session", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Provider revocation state is unavailable" },
    }),
  );
  await page.getByRole("button", { name: "Connect private workspace" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "revocation state is unavailable",
  );
  await expect(
    page.getByRole("heading", { name: "Populated workspace" }),
  ).toHaveCount(0);
});
