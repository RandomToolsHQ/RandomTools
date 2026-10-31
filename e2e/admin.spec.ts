import { test, expect } from "@playwright/test";

test("admin dashboard sends scoped actions and ordinary members see no controls", async ({
  page,
}) => {
  let role = "admin";
  const writes: { path: string; body: any }[] = [];
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "admin-fixture",
          name: "Admin fixture",
          email: "admin@example.test",
          role,
          verified: true,
        },
        pro: true,
      },
    }),
  );
  await page.route("**/api/admin**", (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      writes.push({
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      });
      return route.fulfill({ json: { message: "Fixture action complete" } });
    }
    return route.fulfill({
      json: {
        stats: { users: 2, pro: 1 },
        users: [
          {
            id: "member-fixture",
            name: "Member",
            email: "member@example.test",
            role: "free",
            disabled: 0,
          },
        ],
        subscriptions: [
          {
            id: "subscription-fixture",
            user_id: "member-fixture",
            source: "fixture",
            paid_through: 2000000000,
          },
        ],
        events: [],
        claims: [],
        audit: [],
        usage: [],
      },
    });
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Find users").fill("Member");
  await page.getByRole("button", { name: "Disable account" }).click();
  await expect
    .poll(() =>
      writes.some(
        (w) =>
          w.path === "/api/admin/users" &&
          w.body.id === "member-fixture" &&
          w.body.disabled === true,
      ),
    )
    .toBe(true);
  await page
    .getByRole("combobox", { name: "Tool", exact: true })
    .selectOption("json");
  await page.getByLabel("Enabled", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save availability" }).click();
  await expect
    .poll(() =>
      writes.some(
        (w) =>
          w.path === "/api/admin/tools" &&
          w.body.tool === "json" &&
          w.body.enabled === false,
      ),
    )
    .toBe(true);
  await page
    .getByRole("combobox", { name: "Reason", exact: true })
    .selectOption("dispute");
  await page.getByRole("button", { name: "Revoke paid period" }).click();
  await expect
    .poll(() =>
      writes.some(
        (w) =>
          w.path === "/api/admin/subscriptions/revoke" &&
          w.body.id === "subscription-fixture" &&
          w.body.reason === "dispute",
      ),
    )
    .toBe(true);
  await page.getByLabel("Pending claim ID").fill("claim-fixture");
  await page.getByLabel("Authenticated event ID").fill("event-fixture");
  await page.getByLabel("Confirmed paid-through date").fill("2030-01-01T12:00");
  await page.getByLabel(/I independently verified/).check();
  await page.getByRole("button", { name: "Reconcile membership" }).click();
  await expect
    .poll(() =>
      writes.some(
        (w) =>
          w.path === "/api/admin/reconcile" &&
          w.body.ownershipVerified === true &&
          Number.isInteger(w.body.paidThrough),
      ),
    )
    .toBe(true);
  role = "free";
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText(
    "Administrator access required.",
  );
  await expect(
    page.getByRole("button", { name: "Disable account" }),
  ).toHaveCount(0);
});
