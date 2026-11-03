import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import process from "node:process";
import console from "node:console";
/* global fetch, URL, AbortSignal */
// Local operator harness only: accepts a short-lived OAuth access token, never a
// private-key file or Firebase refresh token. Not imported by either Worker.
const root = resolve(".wrangler/phase9"),
  project = "randomtools-firebase-poc";
const credentials = resolve(process.argv[2] || root + "/admin-access.json"),
  within = relative(root, credentials);
if (within.startsWith("..") || isAbsolute(within))
  throw Error(
    "Administrative evidence must remain under ignored .wrangler/phase9",
  );
const auth = JSON.parse(await readFile(credentials, "utf8"));
if (
  auth.private_key ||
  auth.type === "service_account" ||
  auth.refresh_token ||
  auth.projectId !== project ||
  typeof auth.accessToken !== "string" ||
  !Number.isFinite(auth.expiresAt) ||
  auth.expiresAt <= Date.now() + 60000 ||
  auth.expiresAt > Date.now() + 3600000
)
  throw Error(
    "Provide a scoped short-lived access token; private/refresh keys are refused",
  );
const fixtures = JSON.parse(await readFile(root + "/fixtures.json", "utf8")),
  web = JSON.parse(await readFile(root + "/firebase-web-config.json", "utf8"));
if (
  fixtures.project !== project ||
  web.projectId !== project ||
  !/^phase9-[a-f0-9-]{36}$/.test(fixtures.runId)
)
  throw Error("Unexpected synthetic project/run");
async function admin(op, body) {
  if (Date.now() >= auth.expiresAt) throw Error("Administrative token expired");
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:${op}`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + auth.accessToken,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  );
  const d = await r.json();
  if (!r.ok)
    throw Error(
      "Project-scoped administrative operation failed, HTTP " + r.status,
    );
  return d;
}
async function client(op, body) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${op}?key=${encodeURIComponent(web.apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  );
  const d = await r.json();
  if (!r.ok)
    throw Error("Synthetic authentication operation failed, HTTP " + r.status);
  return d;
}
for (const f of fixtures.fixtures) {
  if (
    !f.uid ||
    !f.email.startsWith(fixtures.runId + "-") ||
    !f.email.endsWith("@example.com")
  )
    throw Error("Unsafe synthetic target");
  const record = (await admin("lookup", { localId: [f.uid] })).users?.[0];
  if (record?.localId !== f.uid || record.email !== f.email)
    throw Error("Synthetic identity mismatch");
  const link = await admin("sendOobCode", {
    requestType: "VERIFY_EMAIL",
    email: f.email,
    returnOobLink: true,
    continueUrl: "https://randomtools-firebase-poc.pages.dev",
  });
  const url = new URL(link.oobLink);
  if (
    !url.hostname.endsWith(".firebaseapp.com") ||
    url.searchParams.get("mode") !== "verifyEmail"
  )
    throw Error("Unexpected verification action");
  await client("update", { oobCode: url.searchParams.get("oobCode") });
  const signed = await client("signInWithPassword", {
    email: f.email,
    password: f.password,
    returnSecureToken: true,
  });
  f.idToken = signed.idToken;
  f.refreshToken = signed.refreshToken;
  await writeFile(root + "/fixtures.json", JSON.stringify(fixtures, null, 2));
  console.log(
    JSON.stringify({
      label: f.label,
      verifiedUsingOfficialActionLink: true,
      hosted: true,
    }),
  );
}
await writeFile(
  root + "/admin-verification-evidence.json",
  JSON.stringify(
    {
      project,
      runId: fixtures.runId,
      verified: fixtures.fixtures.length,
      credentialKind: "short-lived OAuth",
      expiresAt: auth.expiresAt,
      noPrivateKey: true,
    },
    null,
    2,
  ),
);
