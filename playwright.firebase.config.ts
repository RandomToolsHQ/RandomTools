import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./experiments/firebase/e2e",
  workers: 1,
  use: { baseURL: "http://localhost:5190" },
  webServer: {
    command: "node scripts/firebase-poc-ui-server.mjs",
    url: "http://localhost:5190",
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
