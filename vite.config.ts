import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias:
      process.env.VITE_PUBLIC_TOOLS_ONLY === "true"
        ? [
            { find: /^\.\/auth$/, replacement: resolve("src/public-auth.tsx") },
            {
              find: /^\.\/account$/,
              replacement: resolve("src/public-account.tsx"),
            },
          ]
        : [],
  },
  server: {
    proxy: { "/api": process.env.API_PROXY_TARGET || "http://127.0.0.1:8787" },
  },
});
