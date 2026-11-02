import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./prototype/vault/e2e",
  outputDir: ".wrangler/vault-tests",
  workers: 2,
  timeout: 90000,
  use: { baseURL: "http://127.0.0.1:54410" },
  webServer: {
    command: "npm run vault:preview",
    url: "http://127.0.0.1:54410",
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "firefox", use: { browserName: "firefox" } },
    {
      name: "webkit",
      use: { browserName: "webkit", viewport: { width: 390, height: 844 } },
    },
  ],
});
