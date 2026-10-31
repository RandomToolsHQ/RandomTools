import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import console from "node:console";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { loadEnv } from "vite";

const stagingEnv = loadEnv("staging", process.cwd(), "VITE_");
execFileSync(
  process.execPath,
  [process.env.npm_execpath, "run", "build:pages"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ...stagingEnv,
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
const headers = await readFile("dist/_headers", "utf8");
await writeFile(
  "staging/dist/_headers",
  `${headers.trimEnd()}\n  X-Robots-Tag: noindex, nofollow\n`,
);
console.log("Staging artifact prepared in staging/dist with noindex headers.");
