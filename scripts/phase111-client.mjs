// Operator-only client sessions. Never accepts a Google administrative credential.
import fs from "node:fs/promises";
import process from "node:process";
import console from "node:console";
/* global fetch, AbortSignal */
const root = ".wrangler/phase111/private";
const project = "randomtools-supabase-auth-poc";
const manifest = JSON.parse(await fs.readFile(root + "/fixtures.json", "utf8"));
const web = JSON.parse(
  await fs.readFile(root + "/firebase-web-config.json", "utf8"),
);
if (
  manifest.project !== project ||
  web.projectId !== project ||
  !/^phase11-[a-f0-9-]{36}$/.test(manifest.runId) ||
  manifest.fixtures.length !== 3 ||
  manifest.fixtures.some(
    (f) =>
      !["admin", "member", "other"].includes(f.label) ||
      f.email !== manifest.runId + "-" + f.label + "@example.com" ||
      !f.uid ||
      !f.password,
  )
)
  throw Error("Exact synthetic fixture ledger required");
async function call(op, body) {
  const r = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:" +
      op +
      "?key=" +
      encodeURIComponent(web.apiKey),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    },
  );
  const d = await r.json();
  return { status: r.status, data: d };
}
const action = process.argv[2];
if (action === "login") {
  const sessions = {};
  for (const f of manifest.fixtures) {
    const signed = await call("signInWithPassword", {
      email: f.email,
      password: f.password,
      returnSecureToken: true,
    });
    if (signed.status !== 200 || signed.data.localId !== f.uid)
      throw Error("Synthetic login failed, HTTP " + signed.status);
    const profile = await call("lookup", { idToken: signed.data.idToken });
    if (
      profile.status !== 200 ||
      profile.data.users?.[0]?.localId !== f.uid ||
      profile.data.users[0].emailVerified !== true
    )
      throw Error("Verified owned provider session required");
    sessions[f.label] = {
      uid: f.uid,
      idToken: signed.data.idToken,
      refreshToken: signed.data.refreshToken,
    };
  }
  await fs.writeFile(
    root + "/client-sessions.json",
    JSON.stringify({ project, sessions }),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      hosted: true,
      project,
      verifiedLogins: Object.keys(sessions),
    }),
  );
} else if (["disabled-denial", "revoked-denial"].includes(action)) {
  const state = JSON.parse(
    await fs.readFile(root + "/client-sessions.json", "utf8"),
  );
  const f = manifest.fixtures.find((x) => x.label === "other");
  if (state.project !== project || state.sessions.other.uid !== f.uid)
    throw Error("Recorded other fixture required");
  const result = await call("lookup", {
    idToken: state.sessions.other.idToken,
  });
  const allowedCodes =
    action === "disabled-denial"
      ? ["USER_DISABLED"]
      : ["TOKEN_EXPIRED", "INVALID_ID_TOKEN"];
  if (
    result.status !== 400 ||
    !allowedCodes.includes(result.data.error?.message)
  )
    throw Error(
      "Provider did not deny the former session as expected, HTTP " +
        result.status,
    );
  console.log(
    JSON.stringify({
      hosted: true,
      project,
      action,
      formerSessionDenied: true,
    }),
  );
} else throw Error("Use login, disabled-denial or revoked-denial");
