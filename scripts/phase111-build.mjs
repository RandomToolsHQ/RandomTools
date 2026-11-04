// Build only. No login, provisioning, secrets, remote migrations or deployment.
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { createHash } from "node:crypto";
const root = ".wrangler/phase111";
await mkdir(root + "/reference/dist", { recursive: true });
await mkdir(root + "/gateway/dist", { recursive: true });
const substitutions = [];
async function variant(path, oldValue, newValue, count) {
  const source = await readFile(path, "utf8");
  if (source.split(oldValue).length - 1 !== count)
    throw Error("Review source change before producing reference: " + path);
  substitutions.push({ file: path, oldValue, newValue, count });
  return source.replaceAll(oldValue, newValue);
}
const marker = "randomtools-phase11-reference-v1";
const api = await variant(
  "experiments/firebase/worker.ts",
  "randomtools-firebase-poc-v1",
  marker,
  1,
);
let pages = await variant(
  "experiments/firebase/pages-guard.ts",
  "randomtools-firebase-poc-v1",
  marker,
  1,
);
const oldDomain = "randomtools-firebase-poc.firebaseapp.com";
if (pages.split(oldDomain).length - 1 !== 2)
  throw Error("Review Firebase CSP before reference build");
pages = pages.replaceAll(
  oldDomain,
  "randomtools-supabase-auth-poc.firebaseapp.com",
);
substitutions.push({
  file: "experiments/firebase/pages-guard.ts",
  oldValue: oldDomain,
  newValue: "randomtools-supabase-auth-poc.firebaseapp.com",
  count: 2,
});
const oldPolicy = 'response.headers.set("Referrer-Policy", "no-referrer");';
if (pages.split(oldPolicy).length - 1 !== 1)
  throw Error("Review reference form policy");
pages = pages.replace(
  oldPolicy,
  'response.headers.set("Referrer-Policy", ["/__staging","/__staging/logout"].includes(new URL(req.url).pathname)?"same-origin":"no-referrer");',
);
substitutions.push({
  file: "experiments/firebase/pages-guard.ts",
  kind: "same-origin policy for credential form only",
  count: 1,
});
const cspCall = /response\.headers\.set\(\s*"Content-Security-Policy",/g;
if ([...pages.matchAll(cspCall)].length !== 1)
  throw Error("Review reference form CSP");
pages = pages.replace(
  cspCall,
  'if (!["/__staging","/__staging/logout"].includes(new URL(req.url).pathname) || !response.headers.has("Content-Security-Policy")) response.headers.set("Content-Security-Policy",',
);
substitutions.push({
  file: "experiments/firebase/pages-guard.ts",
  kind: "preserve built-in restrictive credential-form CSP",
  count: 1,
});
for (const [name, contents] of [
  ["api", api],
  ["pages", pages],
])
  await build({
    stdin: {
      contents,
      resolveDir: resolve("experiments/firebase"),
      loader: "ts",
    },
    outfile:
      root +
      (name === "api" ? "/reference/api.js" : "/reference/dist/_worker.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    logLevel: "warning",
  });
await build({
  entryPoints: ["experiments/phase111/gateway.ts"],
  outfile: root + "/gateway/dist/_worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  logLevel: "warning",
});
const zero = "00000000-0000-0000-0000-000000000000";
await writeFile(
  root + "/reference/wrangler.toml",
  `name="randomtools-phase11-baseline-api"\nmain="api.js"\ncompatibility_date="2026-10-01"\nworkers_dev=false\npreview_urls=false\n[vars]\nENVIRONMENT="firebase-poc"\nAPP_ORIGIN="https://randomtools-phase11-baseline.pages.dev"\nSTAGING_GATE_ORIGIN="https://randomtools-phase11-baseline.pages.dev"\nFIREBASE_PROJECT_ID="randomtools-supabase-auth-poc"\n[[d1_databases]]\nbinding="DB"\ndatabase_name="randomtools-phase11-baseline"\ndatabase_id="${zero}"\n`,
);
await writeFile(
  root + "/reference/pages.toml",
  `name="randomtools-phase11-baseline"\npages_build_output_dir="./dist"\ncompatibility_date="2026-10-01"\n[vars]\nSTAGING_GATE_ORIGIN="https://randomtools-phase11-baseline.pages.dev"\n[[d1_databases]]\nbinding="GATE_DB"\ndatabase_name="randomtools-phase11-baseline"\ndatabase_id="${zero}"\n[[services]]\nbinding="API"\nservice="randomtools-phase11-baseline-api"\n`,
);
await writeFile(
  root + "/gateway/pages.toml",
  `name="randomtools-phase11-supabase"\npages_build_output_dir="./dist"\ncompatibility_date="2026-10-01"\n[vars]\nPHASE111_GATEWAY="phase111-gateway-v1"\nSTAGING_GATE_ORIGIN="https://randomtools-phase11-supabase.pages.dev"\n[[d1_databases]]\nbinding="GATE_DB"\ndatabase_name="randomtools-phase11-gateway"\ndatabase_id="${zero}"\n`,
);
await writeFile(
  root + "/gateway/schema.sql",
  "BEGIN; CREATE TABLE poc_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO poc_metadata VALUES('isolation','randomtools-phase111-gateway-v1'); CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL); COMMIT;\n",
);
const sql = [];
for (const name of (await readdir("migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort())
  sql.push(await readFile("migrations/" + name, "utf8"));
const sessions = await readFile(
  "experiments/firebase/0006_poc_sessions.sql",
  "utf8",
);
if (sessions.split("randomtools-firebase-poc-v1").length - 1 !== 1)
  throw Error("Review reference schema marker");
sql.push(sessions.replace("randomtools-firebase-poc-v1", marker));
await writeFile(root + "/reference/schema.sql", sql.join("\n"));
const placeholder =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Restricted Phase 11 testing</title><h1>Restricted Phase 11 testing</h1><p>Account browser testing is pending approval and hosted API validation.</p></html>';
await writeFile(root + "/reference/dist/index.html", placeholder);
await writeFile(root + "/gateway/dist/index.html", placeholder);
const files = [
  "reference/api.js",
  "reference/dist/_worker.js",
  "gateway/dist/_worker.js",
];
const hashes = {};
for (const file of files)
  hashes[file] = createHash("sha256")
    .update(await readFile(root + "/" + file))
    .digest("hex");
await writeFile(
  root + "/build.json",
  JSON.stringify(
    { builtOnly: true, substitutions, hashes, requiresNewD1Bindings: true },
    null,
    2,
  ),
);
