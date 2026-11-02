import { test, expect } from "@playwright/test";
test("unconfigured prototype harness fails closed and never contacts Clerk or a backend", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:54380/"))
      external.push(new URL(r.url()).origin);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "RandomTools isolated backend POC" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Not configured");
  await expect(
    page.getByRole("button", { name: "Run 47-request bounded workload" }),
  ).toHaveCount(0);
  expect(external).toEqual([]);
});
