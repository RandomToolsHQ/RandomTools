import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/public-preview.spec.ts",
  use: {
    baseURL: "http://localhost:5180",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  workers: 2,
  webServer: [
    {
      command: "node scripts/e2e-server.mjs frontend",
      url: "http://localhost:5180",
      reuseExistingServer: false,
    },
    {
      command: "node scripts/e2e-server.mjs api",
      url: "http://localhost:8788/api/me",
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    {
      name: "firefox",
      use: { browserName: "firefox", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "webkit",
      use: {
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
  ],
});
