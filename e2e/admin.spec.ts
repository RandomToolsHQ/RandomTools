import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("admin dashboard manages manual access and ordinary members see no controls", async ({
  page,
}) => {
  test.setTimeout(90000); // Includes two full axe scans, as in accessibility.spec.ts.
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
        pro: role === "admin",
      },
    }),
  );
  await page.route("**/api/admin**", (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push({ path, body: request.postDataJSON() });
      return route.fulfill({ json: { message: "Fixture action complete" } });
    }
    if (path === "/api/admin/pro-access")
      return route.fulfill({
        json: {
          requests: [
            {
              id: "approve-fixture",
              user_id: "member-fixture",
              name: "Alice",
              email: "alice@example.test",
              reason: "Testing presets",
              status: "pending",
              created_at: 1700000000,
              decided_at: null,
              disabled: 0,
            },
            {
              id: "deny-fixture",
              user_id: "other-fixture",
              name: "Bob",
              email: "bob@example.test",
              reason: "Synthetic request",
              status: "pending",
              created_at: 1700000000,
              decided_at: null,
              disabled: 0,
            },
          ],
          grants: [
            {
              id: "grant-fixture",
              user_id: "member-fixture",
              name: "Member",
              email: "member@example.test",
              duration: "permanent",
              expires_at: null,
              granted_at: 1700000000,
              revoked_at: null,
            },
          ],
        },
      });
    return route.fulfill({
      json: {
        stats: { users: 3, pro: 1 },
        users: [
          {
            id: "member-fixture",
            name: "Member",
            email: "member@example.test",
            role: "free",
            disabled: 0,
          },
        ],
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
        (w) => w.path === "/api/admin/users" && w.body.disabled === true,
      ),
    )
    .toBe(true);
  await page.getByLabel("Pro recipient").selectOption("member-fixture");
  await page.getByLabel("Direct grant duration").selectOption("permanent");
  await page
    .getByLabel("I understand this grant has no scheduled expiry.")
    .check();
  await page
    .getByRole("button", { name: "Grant Pro access", exact: true })
    .click();
  await expect
    .poll(() =>
      writes.some(
        (w) =>
          w.path === "/api/admin/pro-access/grants" &&
          w.body.userId === "member-fixture" &&
          w.body.duration === "permanent",
      ),
    )
    .toBe(true);
  const approval = page.getByRole("form", {
    name: "Review request from alice@example.test",
  });
  await approval.getByRole("combobox").selectOption("7d");
  await approval.getByRole("button", { name: "Approve request" }).click();
  await expect
    .poll(() =>
      writes.some(
        (w) =>
          w.path === "/api/admin/pro-access/requests" &&
          w.body.id === "approve-fixture" &&
          w.body.decision === "approved" &&
          w.body.duration === "7d",
      ),
    )
    .toBe(true);
  await page
    .getByRole("form", { name: "Review request from bob@example.test" })
    .getByRole("button", { name: "Deny request" })
    .click();
  await expect
    .poll(() =>
      writes.some(
        (w) =>
          w.path === "/api/admin/pro-access/requests" &&
          w.body.id === "deny-fixture" &&
          w.body.decision === "denied",
      ),
    )
    .toBe(true);
  await page
    .getByLabel("Revocation reason for member@example.test")
    .fill("Synthetic test ended");
  await page.getByRole("button", { name: "Revoke grant" }).click();
  await expect
    .poll(() =>
      writes.some(
        (w) =>
          w.path === "/api/admin/pro-access/revoke" &&
          w.body.id === "grant-fixture" &&
          w.body.reason === "Synthetic test ended",
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
        (w) => w.path === "/api/admin/tools" && w.body.enabled === false,
      ),
    )
    .toBe(true);
  for (const light of [false, true]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value ? "light" : "dark";
    }, light);
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      report.violations,
      JSON.stringify(
        report.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ),
    ).toEqual([]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.wrangler/manual-pro-admin-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Reconcile membership" }),
  ).toHaveCount(0);
  role = "free";
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText(
    "Administrator access required.",
  );
  await expect(
    page.getByRole("button", { name: "Grant Pro access", exact: true }),
  ).toHaveCount(0);
});
