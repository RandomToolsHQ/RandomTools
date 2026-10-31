import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5173" },
  webServer: [
    {
      command: process.platform === "win32" ? "npm.cmd run dev" : "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        process.platform === "win32"
          ? "npm.cmd run db:migrate && npm.cmd run dev:api"
          : "npm run db:migrate && npm run dev:api",
      url: "http://localhost:8787/api/me",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
