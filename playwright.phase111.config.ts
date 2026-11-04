import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "experiments/phase111/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 } },
    },
  ],
});
