import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const master = "synthetic master fixture only";
test("synthetic vault encrypts CRUD data, locks, exports and denies network access", async ({
  page,
}, info) => {
  await page.clock.install();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Synthetic vault prototype" }),
  ).toBeVisible();
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:54410/")) external.push(r.url());
  });
  await page.getByLabel("Synthetic master passphrase").fill(master);
  await page.getByLabel("I will use synthetic").check();
  await page.getByRole("button", { name: "Create synthetic vault" }).click();
  await expect(
    page.getByRole("button", { name: "Lock vault", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add synthetic entry" }).click();
  await page
    .getByLabel("Entry title", { exact: true })
    .fill("Synthetic service");
  await page
    .getByLabel("Entry username", { exact: true })
    .fill("fixture@example.test");
  await page
    .getByLabel("Entry password", { exact: true })
    .fill("synthetic-password-only");
  await page.getByLabel("Entry folder", { exact: true }).fill("Tests");
  await page.getByRole("button", { name: "Save encrypted entry" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic service" }),
  ).toBeVisible();
  const raw = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const r = indexedDB.open("randomtools-synthetic-vault-v1", 1);
        r.onsuccess = () => {
          const tx = r.result.transaction("vault", "readonly"),
            get = tx.objectStore("vault").get("encrypted");
          get.onsuccess = () => {
            resolve(JSON.stringify(get.result));
            r.result.close();
          };
          get.onerror = () => reject(Error("read"));
        };
      }),
  );
  for (const value of [
    "Synthetic service",
    "fixture@example.test",
    "synthetic-password-only",
    "Tests",
  ])
    expect(raw).not.toContain(value);
  const envelope = JSON.parse(raw);
  expect(envelope.iterations).toBe(600000);
  expect(envelope.ciphertext.length).toBeGreaterThan(30);
  await page.getByLabel("Search entries").fill("not found");
  await expect(
    page.getByRole("heading", { name: "Synthetic service" }),
  ).toHaveCount(0);
  await page.getByLabel("Search entries").fill("");
  await page.getByRole("button", { name: "Edit Synthetic service" }).click();
  await page
    .getByLabel("Entry title", { exact: true })
    .fill("Renamed synthetic service");
  await page.getByRole("button", { name: "Save encrypted entry" }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed synthetic service" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export encrypted backup" }).click();
  expect((await download).suggestedFilename()).toBe(
    "synthetic-vault-encrypted.json",
  );
  await page.getByRole("button", { name: "Lock vault", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed synthetic service" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Entry password", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Synthetic master passphrase")
    .fill("incorrect synthetic master");
  await page.getByRole("button", { name: "Unlock synthetic vault" }).click();
  await expect(page.getByRole("status")).toContainText("Cannot unlock");
  await page.getByLabel("Synthetic master passphrase").fill(master);
  await page.getByRole("button", { name: "Unlock synthetic vault" }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed synthetic service" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete Renamed synthetic service" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Renamed synthetic service" }),
  ).toHaveCount(0);
  expect(external).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("synthetic-vault.png"),
    fullPage: true,
  });

  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("button", { name: "Unlock synthetic vault" }),
  ).toBeVisible();
  await page.getByLabel("Synthetic master passphrase").fill(master);
  await page.getByRole("button", { name: "Unlock synthetic vault" }).click();
  await expect(
    page.getByRole("button", { name: "Lock vault", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "Unlock synthetic vault" }),
  ).toBeVisible();
  const importedContext = await page.context().browser()!.newContext();
  const imported = await importedContext.newPage();
  await imported.goto("http://127.0.0.1:54410/");
  await imported
    .getByLabel("Import encrypted backup into empty storage")
    .setInputFiles({
      name: "synthetic-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(raw),
    });
  await expect(
    imported.getByRole("button", { name: "Unlock synthetic vault" }),
  ).toBeVisible();
  await imported.getByLabel("Synthetic master passphrase").fill(master);
  await imported.getByLabel("I will use synthetic").check();
  await imported
    .getByRole("button", { name: "Unlock synthetic vault" })
    .click();
  await expect(
    imported.getByRole("heading", { name: "Synthetic service" }),
  ).toBeVisible();
  await expect(
    imported.getByLabel("Import encrypted backup into empty storage"),
  ).toHaveCount(0);
  await importedContext.close();
});
test("vault CSP blocks external connections and avoids plaintext browser preferences", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  expect(response.headers()["content-security-policy"]).toContain(
    "connect-src 'none'",
  );
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  await page.goto("/");
  const blocked = await page.evaluate(async () => {
    try {
      await fetch("https://example.test/");
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
