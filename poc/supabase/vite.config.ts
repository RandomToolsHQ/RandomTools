import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./client", import.meta.url)),
  plugins: [react()],
  server: { host: "127.0.0.1", port: 54380, strictPort: true, cors: false },
  build: {
    outDir: fileURLToPath(
      new URL("../../.wrangler/poc-client", import.meta.url),
    ),
    emptyOutDir: true,
  },
});
