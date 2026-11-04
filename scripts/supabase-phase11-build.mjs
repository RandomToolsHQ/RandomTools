import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
const root = ".wrangler/phase11/supabase";
await mkdir(root + "/functions/randomtools-phase11", { recursive: true });
await build({
  entryPoints: ["experiments/supabase/entry.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  outfile: root + "/functions/randomtools-phase11/index.js",
  logLevel: "warning",
});
await writeFile(
  root + "/config.toml",
  'project_id = "randomtools-phase11"\n[functions.randomtools-phase11]\nverify_jwt = false\nentrypoint = "./functions/randomtools-phase11/index.js"\n',
);
// No deploy, secrets, project link, public build or remote schema changes.
