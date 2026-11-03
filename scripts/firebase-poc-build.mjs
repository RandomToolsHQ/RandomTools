import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { build } from "esbuild";
import process from "node:process";
execFileSync(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--config",
    "experiments/firebase/vite.config.ts",
    "--mode",
    "firebase-poc",
  ],
  { stdio: "inherit", windowsHide: true },
);
await build({
  entryPoints: ["experiments/firebase/pages-guard.ts"],
  outfile: "experiments/firebase/dist/_worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
});
await writeFile(
  "experiments/firebase/dist/_routes.json",
  JSON.stringify({ version: 1, include: ["/*"], exclude: [] }),
);
