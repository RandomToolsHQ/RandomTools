import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
async function settleContrast(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
test("advanced generators keep sensitive results local and export valid synthetic data", async ({
  page,
}) => {
  test.setTimeout(90000); // Multiple tool pages plus a full axe scan on slower engines.
  await page.goto("/tools/password");
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") sent.push(r.url());
  });
  await page.getByLabel("Password length").fill("24");
  await page.getByLabel("How many?").fill("3");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  const results = (
    await page.getByLabel("Generated result").inputValue()
  ).split("\n");
  expect(results).toHaveLength(3);
  expect(results.every((p) => p.length === 24)).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download TXT" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.txt$/);
  await page.getByRole("button", { name: "Clear results" }).click();
  await expect(page.getByLabel("Generated result")).toHaveCount(0);
  await page.getByLabel("Generation mode").selectOption("passphrase");
  await page.getByLabel("Word separator").selectOption(" ");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  expect(
    (await page.getByLabel("Generated result").inputValue())
      .split("\n")[0]
      .split(" "),
  ).toHaveLength(6);
  expect(sent).toEqual([]);
  await page.getByRole("button", { name: "Clear results" }).click();
  await settleContrast(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto("/tools/roblox-usernames");
  await page.getByLabel("How many?").fill("10");
  await page
    .getByRole("combobox", { name: /^Theme/ })
    .selectOption("aesthetic");
  await page.getByLabel("Format", { exact: true }).selectOption("underscore");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  const names = (await page.getByLabel("Generated result").inputValue()).split(
    "\n",
  );
  expect(new Set(names).size).toBe(10);
  expect(names.every((n) => /^[A-Za-z0-9]+_[A-Za-z0-9]+$/.test(n))).toBe(true);
  await page.goto("/tools/test-identities");
  await page.getByLabel("How many?").fill("4");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  const profiles = JSON.parse(
    await page.getByLabel("Generated result").inputValue(),
  );
  expect(profiles).toHaveLength(4);
  expect(
    profiles.every((p: { email: string }) => p.email.endsWith("@example.com")),
  ).toBe(true);
  await page.getByLabel("Reserved email domain").fill("gmail.com");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "reserved" }),
  ).toBeVisible();
  await expect(page.getByLabel("Generated result")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Minecraft lookups require consent and render provider data safely", async ({
  page,
}, info) => {
  let calls = 0;
  await page.route("https://api.mcstatus.io/**", async (r) => {
    calls++;
    await r.fulfill({
      json: {
        online: true,
        players: { online: 12, max: 100 },
        version: { name_clean: "1.21 <script>" },
      },
    });
  });
  await page.goto("/tools/minecraft");
  await expect(
    page.getByRole("button", { name: "Check status" }).first(),
  ).toBeDisabled();
  expect(calls).toBe(0);
  await page.getByLabel("Allow manual status").check();
  await page.getByRole("button", { name: "Check status" }).first().click();
  await expect(page.getByText(/12 \/ 100 players/)).toBeVisible();
  expect(calls).toBe(1);
  expect(await page.locator("script").filter({ hasText: "1.21" }).count()).toBe(
    0,
  );
  await page.getByLabel("Edition", { exact: true }).selectOption("bedrock");
  await expect(page.getByText(/No verified entries/)).toBeVisible();
  await settleContrast(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("minecraft-finder.png"),
    fullPage: true,
  });
  await page.goto("/tools");
  await page.getByRole("button", { name: "Recent", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Minecraft server finder" }),
  ).toBeVisible();
});
