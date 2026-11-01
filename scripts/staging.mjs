import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import console from "node:console";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { loadEnv } from "vite";
import { build } from "esbuild";

const stagingEnv = loadEnv("staging", process.cwd(), "VITE_");
const publishableKey =
  process.env.VITE_CLERK_PUBLISHABLE_KEY ||
  stagingEnv.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey?.startsWith("pk_test_"))
  throw Error("Private staging requires a Clerk development publishable key");
execFileSync(
  process.execPath,
  [process.env.npm_execpath, "run", "build:pages"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ...stagingEnv,
      VITE_CLERK_PUBLISHABLE_KEY: publishableKey,
      VITE_PUBLIC_TOOLS_ONLY: "false",
      VITE_DEPLOYMENT_STAGE: "staging",
      VITE_SITE_URL: "",
    },
  },
);

// Keep the artifact under the staging configuration: Wrangler discovers the
// Pages config within the staging project boundary.
const artifact = resolve("staging/dist");
if (dirname(artifact) !== resolve("staging"))
  throw Error("Unexpected staging artifact path");
await rm(artifact, { recursive: true, force: true });
await mkdir("staging/dist", { recursive: true });
await cp("dist", "staging/dist", { recursive: true, force: true });
const generatedWorker = resolve(artifact, "_worker.js");
if (dirname(generatedWorker) !== artifact)
  throw Error("Unexpected generated Worker path");
await rm(generatedWorker, { recursive: true, force: true });
const headers = await readFile("dist/_headers", "utf8");
const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1];
if (!csp) throw Error("Missing generated staging Content-Security-Policy");
await build({
  entryPoints: ["staging/guard.ts"],
  outfile: artifact + "/_worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  define: { __STAGING_CSP__: JSON.stringify(csp) },
});
// Static assets must never bypass the private gate, including immutable URLs.
await writeFile(
  artifact + "/_routes.json",
  JSON.stringify({ version: 1, include: ["/*"], exclude: [] }),
);
await writeFile(
  "staging/dist/_headers",
  `${headers.trimEnd()}\n  X-Robots-Tag: noindex, nofollow\n`,
);
console.log("Staging artifact prepared in staging/dist with noindex headers.");
