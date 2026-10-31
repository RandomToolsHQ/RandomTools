import { test, expect } from "@playwright/test";
test("public frontend exposes no development authentication or account workspace", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Public tools preview");
  await expect(
    page.getByRole("link", { name: "Log in", exact: true }),
  ).toHaveCount(0);
  for (const path of [
    "/login",
    "/register",
    "/dashboard",
    "/settings",
    "/subscription",
    "/admin",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Restricted testing area" }),
    ).toBeVisible();
    await expect(
      page.locator('input[type="password"],input[type="email"]'),
    ).toHaveCount(0);
  }
  expect(
    requests.filter((url) =>
      /clerk\.(accounts\.dev|com)|accounts\.dev/.test(url),
    ),
  ).toEqual([]);
});
test("hosted public API stays closed to account, admin, Pro and payment requests", async ({
  request,
}) => {
  for (const path of [
    "/api/me",
    "/api/auth/register",
    "/api/admin",
    "/api/pro/presets",
    "/api/account/export",
    "/api/webhooks/kofi",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(403);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["content-type"]).toContain("application/json");
  }
  const response = await request.post("/api/auth/register", {
    data: { email: "synthetic@example.test" },
  });
  expect(response.status()).toBe(403);
});
