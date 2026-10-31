import { test, expect } from "@playwright/test";
test("directory search and JSON tool work without an account", async ({
  page,
}) => {
  await page.goto("/tools");
  await page.getByRole("textbox", { name: "Search tools" }).fill("JSON");
  await expect(
    page.getByRole("heading", { name: "JSON formatter" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /JSON formatter/ }).click();
  await page.getByLabel("Input", { exact: true }).fill('{"hello":"world"}');
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(page.getByLabel("Result", { exact: true })).toHaveValue(
    '{\n  "hello": "world"\n}',
  );
  await page.getByLabel("Input", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
test("mobile navigation exposes tools and Pro", async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto("/");
  if (testInfo.project.name === "mobile" || isMobile) {
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Explore tools" }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: /Your everyday toolkit/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("landing.png"),
    fullPage: true,
  });
});
