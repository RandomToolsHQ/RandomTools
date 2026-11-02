import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:54380" },
  webServer: {
    command: "npm run poc:supabase:dev",
    url: "http://127.0.0.1:54380",
    reuseExistingServer: false,
    env: { VITE_POC_CLERK_PUBLISHABLE_KEY: "", VITE_POC_PROJECT_REF: "" },
  },
});
