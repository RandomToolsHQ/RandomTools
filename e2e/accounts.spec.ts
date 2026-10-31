import { test, expect } from "@playwright/test";
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
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your workspace awaits." }),
  ).toBeVisible();
});
