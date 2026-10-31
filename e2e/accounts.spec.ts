import { test, expect } from "@playwright/test";
test.beforeEach(async ({ context }, info) => {
  const project =
    ["desktop", "mobile", "firefox", "webkit"].indexOf(info.project.name) + 1;
  await context.setExtraHTTPHeaders({
    "CF-Connecting-IP": `192.0.${project}.${info.title.includes("reset") ? 2 : 1}`,
  });
});
test("registration, verification, login, protected workspace and logout", async ({
  page,
}) => {
  test.setTimeout(90000);
  const email = `browser-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Browser tester");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a very strong testing password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("link", { name: "Open testing link" }).click();
  await page
    .getByLabel("Password", { exact: true })
    .fill("a very strong testing password");
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByRole("status")).toContainText("Email verified");
  await page.getByRole("link", { name: "Log in", exact: true }).last().click();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a very strong testing password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await expect(
    page.getByRole("heading", { name: "Hello, Browser tester." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your essentials, ready to go." }),
  ).toBeVisible();
  const pro = await page.request.get("/api/pro/presets");
  expect(pro.status()).toBe(403);
  const admin = await page.request.get("/api/admin");
  expect(admin.status()).toBe(403);
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("**/");
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your workspace awaits." }),
  ).toBeVisible();
});
test("resend verification, reset password, revoke sessions and delete account", async ({
  page,
}) => {
  test.setTimeout(90000);
  const email = `reset-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Reset tester");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("original strong testing password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("link", { name: "Open testing link" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Resend verification" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("link", { name: "Open testing link" }).click();
  await page
    .getByLabel("Password", { exact: true })
    .fill("original strong testing password");
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByRole("status")).toContainText("Email verified");
  await page.getByRole("link", { name: "Reset password" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("link", { name: "Open testing link" }).click();
  await page
    .getByLabel("Password", { exact: true })
    .fill("new strong testing password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("status")).toContainText("Password changed");
  await page.getByRole("link", { name: "Log in", exact: true }).last().click();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("new strong testing password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Confirm password").fill("new strong testing password");
  await page
    .getByRole("checkbox", { name: "I understand that deletion is permanent." })
    .check();
  await page
    .getByRole("button", { name: "Permanently delete account" })
    .click();
  await page.waitForURL("**/");
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your workspace awaits." }),
  ).toBeVisible();
});
