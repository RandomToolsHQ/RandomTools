import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./private-e2e",
  workers: 2,
  use: {
    baseURL: "https://randomtools-web-staging.pages.dev",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
