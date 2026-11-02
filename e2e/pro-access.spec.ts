import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("previous approval cannot disguise expired or revoked Pro access", async ({
  page,
}) => {
  let revoked = false;
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "status-fixture",
          name: "Synthetic",
          email: "status@example.test",
          role: "free",
          verified: true,
        },
        pro: false,
      },
    }),
  );
  await page.route("**/api/pro-access", (r) =>
    r.fulfill({
      json: {
        pro: false,
        requests: [
          {
            id: "request",
            reason: "Synthetic",
            status: "approved",
            created_at: 1,
            decided_at: 2,
          },
        ],
        grants: [
          {
            id: "grant",
            duration: "7d",
            granted_at: 2,
            expires_at: 3,
            revoked_at: revoked ? 4 : null,
          },
        ],
      },
    }),
  );
  await page.goto("/subscription");
  await expect(
    page.getByRole("status").filter({ hasText: "Current Pro access:" }),
  ).toContainText("expired");
  await expect(
    page.getByRole("button", { name: "Request Pro access", exact: true }),
  ).toBeVisible();
  revoked = true;
  await page.reload();
  await expect(
    page.getByRole("status").filter({ hasText: "Current Pro access:" }),
  ).toContainText("revoked");
});
test("members request access once, see statuses, and never see paid controls", async ({
  page,
}) => {
  test.setTimeout(90000); // Includes two full axe scans, as in accessibility.spec.ts.
  let status = "",
    reason = "";
  let failed = false;
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "member-fixture",
          name: "Member",
          email: "member@example.test",
          role: "free",
          verified: true,
        },
        pro: false,
      },
    }),
  );
  await page.route("**/api/pro-access**", (route) => {
    if (route.request().method() === "POST") {
      reason = route.request().postDataJSON().reason;
      status = "pending";
      return route.fulfill({
        status: 201,
        json: {
          message: "Pro access requested. An administrator will review it.",
        },
      });
    }
    if (failed)
      return route.fulfill({
        status: 503,
        json: { error: "Synthetic service unavailable" },
      });
    return route.fulfill({
      json: {
        pro: false,
        requests: status
          ? [
              {
                id: "request-fixture",
                reason,
                status,
                created_at: 1700000000,
                decided_at: status === "pending" ? null : 1700000100,
              },
            ]
          : [],
        grants: [],
      },
    });
  });
  await page.goto("/subscription");
  await expect(
    page.getByRole("heading", { name: "Your Pro access", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Why would you like Pro?")
    .fill("<script>window.unsafeFixture=true</script>");
  await page
    .getByRole("button", { name: "Request Pro access", exact: true })
    .click();
  await expect(
    page.getByText("Your request is pending review.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request Pro access", exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => "unsafeFixture" in window)).toBe(false);
  status = "denied";
  await page.reload();
  await expect(
    page.getByRole("article").getByText("denied", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request Pro access", exact: true }),
  ).toBeVisible();
  for (const light of [false, true]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value ? "light" : "dark";
    }, light);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations,
      JSON.stringify(
        result.violations.map((v) => ({
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
  await expect(page.getByText("Ko-fi transaction ID")).toHaveCount(0);
  failed = true;
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText(
    "Synthetic service unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Request Pro access", exact: true }),
  ).toHaveCount(0);
});
