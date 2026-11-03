import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envDir: process.cwd(),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8793",
      "/__staging": "http://127.0.0.1:8793",
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
