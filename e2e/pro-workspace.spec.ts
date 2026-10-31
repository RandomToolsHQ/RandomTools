import { test, expect } from "@playwright/test";
test("Pro browser engines run with an entitled account API fixture", async ({
  page,
}) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "fixture",
          name: "Pro tester",
          email: "pro@example.test",
          role: "free",
          verified: true,
        },
        pro: true,
      },
    }),
  );
  await page.route("**/api/pro/**", (route) =>
    route.fulfill({
      json: route.request().url().endsWith("preferences")
        ? { data: "{}", retention_days: 30 }
        : [],
    }),
  );
  await page.goto("/dashboard");
  await page.getByLabel("Input", { exact: true }).fill("hello\nworld");
  await page.getByRole("button", { name: "Run transformation" }).click();
  await expect(page.getByLabel("Result", { exact: true })).toHaveValue(
    "HELLO\nWORLD",
  );
  await page
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("json");
  await page.getByLabel("Input", { exact: true }).fill('{"b":2,"a":1}');
  await page.getByLabel("Comparison JSON").fill('{"a":1,"b":2}');
  await page.getByRole("button", { name: "Run transformation" }).click();
  await expect(page.getByLabel("Result", { exact: true })).toHaveValue(
    "Structurally equal",
  );
  await page
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("workflow");
  await page.getByLabel("Input", { exact: true }).fill(" Hello World ");
  await page.getByLabel("Ordered workflow steps").fill("trim,lower,slug");
  await page.getByRole("button", { name: "Run transformation" }).click();
  await expect(page.getByLabel("Result", { exact: true })).toHaveValue(
    "hello-world",
  );
  await page
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("regex");
  await page
    .getByLabel("Input", { exact: true })
    .fill("hello world\nsecond case");
  await page.getByLabel("Regex pattern").fill("(?<word>\\w+)");
  await page.getByRole("button", { name: "Run transformation" }).click();
  await expect
    .poll(() => page.getByLabel("Result", { exact: true }).inputValue())
    .toContain("captures");
  await page
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("qr");
  await page
    .getByLabel("Input", { exact: true })
    .fill("https://example.com\nHello");
  await page.getByRole("button", { name: "Run transformation" }).click();
  await expect
    .poll(() => page.getByLabel("Result", { exact: true }).inputValue())
    .toContain("<svg");
  await page.locator("input[type=file]").setInputFiles([
    { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
    { name: "b.txt", mimeType: "text/plain", buffer: Buffer.from("world") },
  ]);
  await expect
    .poll(() => page.getByLabel("Result", { exact: true }).inputValue())
    .toContain("2cf24dba5fb0a30e");
});
