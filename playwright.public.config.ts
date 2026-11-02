import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "all-tools.spec.ts",
    "accessibility.spec.ts",
    "tools.spec.ts",
    "public-preview.spec.ts",
    "expanded-tools.spec.ts",
  ],
  workers: 2,
  use: { baseURL: process.env.PUBLIC_TEST_URL || "http://localhost:8793" },
  webServer: process.env.PUBLIC_TEST_URL
    ? undefined
    : {
        command:
          "node node_modules/wrangler/bin/wrangler.js pages dev dist --cwd public-staging --port 8793 --inspector-port 9243",
        url: "http://localhost:8793",
        reuseExistingServer: true,
      },
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
