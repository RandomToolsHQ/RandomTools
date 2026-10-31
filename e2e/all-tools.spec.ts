import { test, expect } from "@playwright/test";
test("all text tools produce useful browser results", async ({ page }) => {
  for (const [id, input, other, expected] of [
    ["base64", "Hello 🌏", "", "SGVsbG8g8J+Mjw=="],
    ["url", "a b", "", "a%20b"],
    ["unix", "0", "", "1970-01-01"],
    ["uuid", "2", "", "-"],
    ["diff", "before", "after", "+ after"],
    ["regex", "(?<word>hello)", "hello world", "hello"],
    ["html", "<script>", "", "&lt;script&gt;"],
    ["password", "24", "", ""],
    ["counter", "one two", "", '"words": 2'],
    ["case", "Hello World", "", "HELLO WORLD"],
    ["colour", "rgb(255, 0, 0)", "", "#FF0000"],
    ["random", "4", "4", "4"],
    ["discord", "2020-01-01T00:00:00Z", "", "<t:1577836800:F>"],
    ["snowflake", "175928847299117063", "", "2016-04-30"],
  ]) {
    await page.goto("/tools/" + id);
    await page.locator("#input").fill(input);
    if (other) await page.locator("#other").fill(other);
    await page.getByRole("button", { name: "Run tool" }).click();
    await expect(page.locator("#output")).toContainText("");
    await expect
      .poll(() => page.locator("#output").inputValue())
      .toContain(expected);
    if (id === "password")
      expect((await page.locator("#output").inputValue()).length).toBe(24);
  }
});
test("QR, hashing and image compression process local inputs", async ({
  page,
}) => {
  await page.goto("/tools/qr");
  await page.locator("#input").fill("https://example.com");
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(
    page.getByRole("img", { name: "Generated QR code" }),
  ).toBeVisible();
  await page.goto("/tools/hash");
  await page.locator("input[type=file]").setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect
    .poll(() => page.locator("#output").inputValue())
    .toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  await page.goto("/tools/image");
  const png = await page.screenshot({
    clip: { x: 0, y: 0, width: 40, height: 40 },
  });
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: png });
  await expect
    .poll(() => page.locator("#output").inputValue())
    .toContain("Compressed (");
  const jpeg = await page.screenshot({
    type: "jpeg",
    quality: 90,
    clip: { x: 0, y: 0, width: 40, height: 40 },
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "sample.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });
  await expect
    .poll(() => page.locator("#output").inputValue())
    .toMatch(/Compressed \((?:WEBP|JPG)\)/);
});
