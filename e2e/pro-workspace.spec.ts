import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
test("Pro browser engines run with an entitled account API fixture", async ({
  page,
}, testInfo) => {
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
  await page
    .getByRole("combobox", { name: "Batch operation" })
    .selectOption("image");
  const png = await page.screenshot({
    clip: { x: 0, y: 0, width: 40, height: 40 },
  });
  const downloading = page.waitForEvent("download");
  await page.locator("input[type=file]").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: png },
    { name: "second.png", mimeType: "image/png", buffer: png },
  ]);
  const zip = await downloading;
  expect(zip.suggestedFilename()).toBe("randomtools-images.zip");
  const path = testInfo.outputPath("images.zip");
  await zip.saveAs(path);
  const images = unzipSync(await readFile(path));
  expect(Object.keys(images)).toHaveLength(2);
  expect(
    Object.keys(images).every((name) => /\.(webp|png|jpg)$/.test(name)),
  ).toBe(true);
});
