import { test, expect } from "@playwright/test";
test("blocked device storage preserves tools, theme controls and private-by-default analytics", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Synthetic storage denial", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Synthetic quota failure", "QuotaExceededError");
    };
  });
  const usage: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/usage")) usage.push(r.url());
  });
  await page.goto("/tools");
  await expect(
    page.getByRole("heading", { name: "JSON formatter" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle colour theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "Favourite JSON formatter", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Unfavourite JSON formatter",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("status").filter({ hasText: "Favourites work only" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /JSON formatter/ }).click();
  await page.getByLabel("Input", { exact: true }).fill('{"synthetic":true}');
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(page.getByLabel("Result", { exact: true })).toHaveValue(
    '{\n  "synthetic": true\n}',
  );
  expect(usage).toEqual([]);
});
