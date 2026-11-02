import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("anonymous gateway is accessible and loads no account SDK", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/__staging");
  await expect(
    page.getByRole("heading", { name: "Private staging access", exact: true }),
  ).toBeVisible();
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(report.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Approved tester email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Staging access key")).toBeFocused();
  expect(
    requests.some((url) => /clerk|accounts\.dev|\/assets\//.test(url)),
  ).toBe(false);
});

test("direct account navigation returns to the gateway and API/assets stay denied", async ({
  page,
  request,
}) => {
  await page.goto("/login/");
  await expect(page).toHaveURL(/\/__staging$/);
  for (const path of [
    "/api/me",
    "/api/admin",
    "/api/pro/presets",
    "/api/pro-access",
    "/api/admin/pro-access",
    "/assets/private.js",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(403);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
});
