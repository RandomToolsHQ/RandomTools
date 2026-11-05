// Build only. Real public Firebase web configuration remains behind the staging gate.
import { build } from "esbuild";
import { readFile, copyFile } from "node:fs/promises";
import process from "node:process";
const project = "randomtools-supabase-auth-poc";
const source = process.argv.includes("--synthetic")
  ? {
      projectId: project,
      authDomain: project + ".firebaseapp.com",
      apiKey: "synthetic-browser-key",
      appId: "synthetic-browser-app",
    }
  : JSON.parse(
      await readFile(
        ".wrangler/phase111/private/firebase-web-config.json",
        "utf8",
      ),
    );
if (
  source.projectId !== project ||
  source.authDomain !== project + ".firebaseapp.com"
)
  throw Error("Exact isolated Firebase configuration required");
const config = Object.fromEntries(
  ["projectId", "authDomain", "apiKey", "appId"].map((k) => [k, source[k]]),
);
if (Object.values(config).some((v) => typeof v !== "string" || !v))
  throw Error("Public web configuration incomplete");
await build({
  entryPoints: ["experiments/phase111/browser/main.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: ".wrangler/phase111/gateway/dist/test.js",
  define: { PHASE111_FIREBASE_CONFIG: JSON.stringify(config) },
  logLevel: "warning",
});
await copyFile(
  "experiments/phase111/browser/index.html",
  ".wrangler/phase111/gateway/dist/index.html",
);
await copyFile(
  "experiments/phase111/browser/test.css",
  ".wrangler/phase111/gateway/dist/test.css",
);
