import { test, expect } from "@playwright/test";
test("public static pages preserve security and staging indexing headers", async ({
  request,
}) => {
  const response = await request.get("/tools/json");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain(
    "default-src 'self'",
  );
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  expect(response.headers()["strict-transport-security"]).toContain(
    "max-age=31536000",
  );
});
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
    "/api/pro/ip-lookup",
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
  const lookup = await request.post("/api/pro/ip-lookup", {
    data: { ip: "1.1.1.1", consent: true },
  });
  expect(lookup.status()).toBe(403);
});
