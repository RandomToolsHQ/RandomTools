// Operator-only synthetic Firebase fixtures. No privileged credentials or cloud deployments.
import fs from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import process from "node:process";
import console from "node:console";
/* global fetch, AbortSignal */
const root = ".wrangler/phase111/private";
const project = "randomtools-supabase-auth-poc";
const web = JSON.parse(
  await fs.readFile(root + "/firebase-web-config.json", "utf8"),
);
if (web.projectId !== project || web.messagingSenderId !== "771458729298")
  throw Error("Exact approved synthetic project required");
if (process.argv[2] !== "create")
  throw Error("Explicit create action required");
const path = root + "/fixtures.json";
const manifest = { project, runId: "phase11-" + randomUUID(), fixtures: [] };
// Never overwrite or silently recreate an existing fixture ledger.
await fs.writeFile(path, JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
for (const label of ["admin", "member", "other"]) {
  const email = manifest.runId + "-" + label + "@example.com";
  const password = randomBytes(32).toString("base64url");
  const result = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" +
      encodeURIComponent(web.apiKey),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!result.ok)
    throw Error("Synthetic signup rejected, HTTP " + result.status);
  const signed = await result.json();
  if (signed.email !== email || typeof signed.localId !== "string")
    throw Error("Unexpected synthetic signup response");
  manifest.fixtures.push({ label, email, uid: signed.localId, password });
  await fs.writeFile(path, JSON.stringify(manifest, null, 2), { mode: 0o600 });
}
await fs.writeFile(
  root + "/remote-fixtures.json",
  JSON.stringify({
    project,
    runId: manifest.runId,
    apiKey: web.apiKey,
    fixtures: manifest.fixtures.map(({ label, uid, email }) => ({
      label,
      uid,
      email,
    })),
  }),
  { flag: "wx", mode: 0o600 },
);
console.log(
  JSON.stringify({
    project,
    runId: manifest.runId,
    fixtures: manifest.fixtures.map(({ label, uid }) => ({ label, uid })),
  }),
);
