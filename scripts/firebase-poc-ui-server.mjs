import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import process from "node:process";
/* global URL */
process.env.VITE_FIREBASE_POC_CONFIG = JSON.stringify({
  apiKey: "synthetic-browser-key",
  authDomain: "demo-randomtools-poc.firebaseapp.com",
  projectId: "demo-randomtools-poc",
  appId: "synthetic-browser-app",
});
const server = await createServer({
  configFile: fileURLToPath(
    new URL("../experiments/firebase/vite.config.ts", import.meta.url),
  ),
});
await server.listen();
server.printUrls();
