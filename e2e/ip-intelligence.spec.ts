import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
const result = {
  ip: "1.1.1.1",
  country: "Australia",
  countryCode: "AU",
  region: "NSW",
  city: "Sydney",
  latitude: 0,
  longitude: 151.2,
  timezone: null,
  countryTimezones: ["Australia/Sydney", "Australia/Perth"],
  isp: null,
  organization: null,
  asn: "AS13335",
  asnOrganization: "Cloudflare",
  indicators: { proxy: false, vpn: null, hosting: null },
  provider: "FreeIPAPI",
  attribution: "IP data from FreeIPAPI — https://freeipapi.com",
  notice:
    "Approximate network location, not a physical address. Provider indicators are not proof of VPN, proxy or hosting use.",
};
test("Pro IP lookup has consent, loading, accessible results and private local exports", async ({
  page,
}, info) => {
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "synthetic",
          name: "Pro tester",
          role: "free",
          verified: true,
        },
        pro: true,
      },
    }),
  );
  let calls = 0;
  await page.route("**/api/pro/**", async (r) => {
    if (r.request().url().endsWith("/ip-lookup")) {
      calls++;
      expect(r.request().method()).toBe("POST");
      expect(r.request().postDataJSON()).toEqual({
        ip: "1.1.1.1",
        consent: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      return r.fulfill({ json: result });
    }
    return r.fulfill({
      json: r.request().url().endsWith("/preferences")
        ? { data: "{}", retention_days: 30 }
        : [],
    });
  });
  await page.goto("/dashboard");
  const widget = page.getByRole("region", { name: "IP Intelligence Lookup" });
  // Named section is exposed as a region through aria-labelledby.
  await expect(widget).toBeVisible();
  await widget.getByLabel("Public IP address", { exact: true }).fill("1.1.1.1");
  await expect(
    widget.getByRole("button", { name: "Look up IP", exact: true }),
  ).toBeDisabled();
  await widget.getByRole("checkbox").check();
  await widget.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(
    widget.getByRole("button", { name: "Looking up…" }),
  ).toBeDisabled();
  await expect(widget.getByText("AS13335", { exact: true })).toBeVisible();
  await expect(widget.getByText("Unavailable", { exact: true })).toHaveCount(5);
  await expect(widget.locator("dd").filter({ hasText: /^0$/ })).toBeVisible();
  await expect(widget.getByText("Not flagged by provider")).toBeVisible();
  expect(calls).toBe(1);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".ip-intelligence")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const format of ["JSON", "TXT"]) {
    const downloading = page.waitForEvent("download");
    await widget.getByRole("button", { name: "Download IP " + format }).click();
    const d = await downloading,
      file = info.outputPath(d.suggestedFilename());
    await d.saveAs(file);
    const content = await readFile(file, "utf8");
    if (format === "JSON") expect(JSON.parse(content)).toEqual(result);
    else {
      expect(content).toContain("ISP: Unavailable");
      expect(content).toContain("not a physical address");
    }
  }
  await widget.getByLabel("Public IP address", { exact: true }).fill("8.8.8.8");
  await expect(
    widget.getByRole("button", { name: "Download IP JSON" }),
  ).toHaveCount(0);
});
test("IP provider errors clear results and ordinary accounts have no Pro lookup interface", async ({
  page,
}) => {
  let pro = true;
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "synthetic",
          name: "Test member",
          role: "free",
          verified: true,
        },
        pro,
      },
    }),
  );
  await page.route("**/api/pro/**", (r) =>
    r.request().url().endsWith("/ip-lookup")
      ? r.fulfill({
          status: 503,
          json: {
            error: "The lookup provider is rate limited. Try again later.",
          },
        })
      : r.fulfill({
          json: r.request().url().endsWith("/preferences")
            ? { data: "{}", retention_days: 30 }
            : [],
        }),
  );
  await page.goto("/dashboard");
  await page.getByLabel("Public IP address", { exact: true }).fill("1.1.1.1");
  await page.locator(".ip-intelligence").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("rate limited");
  await expect(
    page.getByRole("button", { name: "Download IP JSON" }),
  ).toHaveCount(0);
  pro = false;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "IP Intelligence Lookup" }),
  ).toHaveCount(0);
});
test("saved workflow load failures preserve inputs, valid ordered workflows run and edits clear stale exports", async ({
  page,
}) => {
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "synthetic",
          name: "Pro tester",
          role: "free",
          verified: true,
        },
        pro: true,
      },
    }),
  );
  await page.route("**/api/pro/**", (r) =>
    r.fulfill({
      json: r.request().url().endsWith("/presets")
        ? [
            {
              id: "invalid",
              name: "Corrupt workflow",
              data: '{"operation":"workflow","steps":["eval"]}',
            },
            {
              id: "valid",
              name: "Ordered workflow",
              data: JSON.stringify({
                operation: "workflow",
                steps: "trim,lower,slug",
              }),
            },
          ]
        : r.request().url().endsWith("/preferences")
          ? { data: "{}", retention_days: 30 }
          : [],
    }),
  );
  await page.goto("/dashboard");
  await page.getByLabel("Input", { exact: true }).fill("  Hello WORLD!  ");
  await page.getByRole("button", { name: "Corrupt workflow · load" }).click();
  await expect(page.getByText(/saved configuration is invalid/)).toBeVisible();
  await expect(page.getByLabel("Input", { exact: true })).toHaveValue(
    "  Hello WORLD!  ",
  );
  await page.getByRole("button", { name: "Ordered workflow · load" }).click();
  await expect(page.getByLabel("Ordered workflow steps")).toHaveValue(
    "trim,lower,slug",
  );
  await page.getByRole("button", { name: "Run transformation" }).click();
  await expect(page.getByLabel("Result", { exact: true })).toHaveValue(
    "hello-world",
  );
  await page.getByLabel("Input", { exact: true }).fill("New input");
  await expect(
    page.getByRole("button", { name: "Text export", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Ordered workflow steps").fill("trim,eval");
  await page.getByRole("button", { name: "Run transformation" }).click();
  await expect(page.getByText(/Use up to 10 ordered steps/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Text export", exact: true }),
  ).toBeDisabled();
});
