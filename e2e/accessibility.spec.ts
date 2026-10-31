import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("public pages meet automated WCAG A/AA checks in dark and light themes", async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const path of ["/", "/login", "/tools/json", "/pro"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
          null,
          2,
        ),
      ).toEqual([]);
    }
  }
});
test("search shortcut and skip link work with the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your everyday toolkit/ }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("/");
  await expect(
    page.getByRole("textbox", { name: "Search tools" }),
  ).toBeFocused();
});
