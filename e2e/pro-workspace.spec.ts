import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

test("Pro presets, workflows, history, preferences and all export formats work with scoped fixtures", async ({
  page,
}, testInfo) => {
  let presets: any[] = [];
  let history: any[] = [];
  let preferences = { data: "{}", retention_days: 30 };
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
  await page.route("**/api/pro/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== "GET") {
      const body = request.postDataJSON();
      if (path.endsWith("presets"))
        presets =
          method === "DELETE"
            ? presets.filter((p) => p.id !== body.id)
            : [
                ...presets,
                { id: "saved", ...body, data: JSON.stringify(body.data) },
              ];
      if (path.endsWith("history"))
        history =
          method === "DELETE"
            ? []
            : [...history, { id: "history", ...body, created_at: 1 }];
      if (path.endsWith("preferences"))
        preferences = {
          data: JSON.stringify(body.data),
          retention_days: body.retentionDays,
        };
      return route.fulfill({ json: { message: "Saved fixture" } });
    }
    return route.fulfill({
      json: path.endsWith("presets")
        ? presets
        : path.endsWith("history")
          ? history
          : preferences,
    });
  });
  await page.goto("/dashboard");
  await page.getByLabel("Input", { exact: true }).fill("=sum(1,2)");
  await page.getByRole("button", { name: "Run transformation" }).click();
  for (const [label, name] of [
    ["Text export", "workspace.txt"],
    ["JSON export", "workspace.json"],
    ["CSV export", "workspace.csv"],
  ]) {
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = await downloading;
    expect(file.suggestedFilename()).toBe(name);
    const path = testInfo.outputPath(name);
    await file.saveAs(path);
    const text = await readFile(path, "utf8");
    if (name.endsWith("csv")) expect(text).toContain('"\'=SUM(1,2)"');
    else if (name.endsWith("json"))
      expect(JSON.parse(text).result).toBe("=SUM(1,2)");
    else expect(text).toBe("=SUM(1,2)");
  }
  await page.getByRole("button", { name: "Save private history" }).click();
  await expect.poll(() => history.length).toBe(1);
  await page.getByRole("button", { name: "Clear all history" }).click();
  await expect.poll(() => history.length).toBe(0);
  await page
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("workflow");
  await page.getByLabel("Ordered workflow steps").fill("trim,lower,slug");
  await page.getByLabel("Preset name").fill("My workflow");
  await page
    .getByRole("button", { name: "Save current configuration" })
    .click();
  await expect(
    page.getByRole("button", { name: "My workflow · load" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("case");
  await page.getByRole("button", { name: "My workflow · load" }).click();
  await expect(
    page.getByRole("combobox", { name: "Operation", exact: true }),
  ).toHaveValue("workflow");
  await page.getByRole("button", { name: "Delete My workflow" }).click();
  await expect(
    page.getByRole("button", { name: "My workflow · load" }),
  ).toHaveCount(0);
  await page.getByLabel("History retention").selectOption("7");
  await page.getByRole("button", { name: "Upload preferences" }).click();
  await expect.poll(() => preferences.retention_days).toBe(7);
  expect(JSON.parse(preferences.data)).toHaveProperty("favorites");
  await page.getByRole("button", { name: "Restore from cloud" }).click();
  await expect(
    page.getByRole("heading", { name: "Cloud preferences & favourites" }),
  ).toBeVisible();
});
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
  await expect(page.locator("input[type=file]")).toBeEnabled();
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
