import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import process from "node:process";
import { build } from "esbuild";

// Explicitly clear all auth configuration regardless of local environment files.
execFileSync(process.execPath, [process.env.npm_execpath, "run", "build"], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    VITE_PUBLIC_TOOLS_ONLY: "true",
    VITE_CLERK_PUBLISHABLE_KEY: "",
    VITE_DEPLOYMENT_STAGE: "public-staging",
    VITE_SITE_URL: "",
  },
});
const target = resolve("public-staging/dist");
if (dirname(target) !== resolve("public-staging"))
  throw Error("Unexpected public artifact path");
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp("dist", target, { recursive: true });
await build({
  entryPoints: ["public-staging/guard.ts"],
  outfile: target + "/_worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
});
await writeFile(
  target + "/_routes.json",
  JSON.stringify({ version: 1, include: ["/api", "/api/*"], exclude: [] }),
);
await writeFile(
  target + "/_headers",
  (await readFile("public/_headers", "utf8")).trimEnd() +
    "\n  X-Robots-Tag: noindex, nofollow\n  Strict-Transport-Security: max-age=31536000\n",
);
await writeFile(target + "/robots.txt", "User-agent: *\nDisallow: /\n");
