// Operator-only, approved isolated synthetic API testing. No administrative Google credential.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import process from "node:process";
import console from "node:console";
/* global fetch, AbortSignal */
const root = ".wrangler/phase111/private";
const a = JSON.parse(
  await fs.readFile(root + "/prepared-activation.json", "utf8"),
);
const fixtures = JSON.parse(await fs.readFile(root + "/fixtures.json", "utf8"));
const signed = JSON.parse(
  await fs.readFile(root + "/client-sessions.json", "utf8"),
);
const url =
  "https://ijlohzzqszyhncglqsfq.supabase.co/functions/v1/randomtools-phase11";
const hash = (x) => createHash("sha256").update(x).digest("hex");
if (
  fixtures.project !== "randomtools-supabase-auth-poc" ||
  signed.project !== fixtures.project ||
  !/^phase11-[a-f0-9-]{36}$/.test(fixtures.runId) ||
  a.deadline * 1000 <= Date.now()
)
  throw Error("Exact active synthetic approval window required");
let state;
try {
  state = JSON.parse(
    await fs.readFile(root + "/supabase-hosted-state.json", "utf8"),
  );
} catch {
  state = { runId: fixtures.runId, people: {}, checks: [] };
}
if (state.runId !== fixtures.runId) throw Error("Different fixture ledger");
for (const f of fixtures.fixtures) {
  if (
    !["admin", "member", "other"].includes(f.label) ||
    f.email !== fixtures.runId + "-" + f.label + "@example.com" ||
    signed.sessions[f.label]?.uid !== f.uid
  )
    throw Error("Recorded synthetic identity required");
  state.people[f.label] ||= {
    uid: f.uid,
    email: f.email,
    id:
      "firebase_" +
      hash("https://securetoken.google.com/" + fixtures.project + "\n" + f.uid),
    cookie: "",
  };
  if (state.people[f.label].uid !== f.uid)
    throw Error("Stored subject mismatch");
}
async function save() {
  await fs.writeFile(
    root + "/supabase-hosted-state.json",
    JSON.stringify(state, null, 2),
    { mode: 0o600 },
  );
}
async function check(name, condition, status) {
  state.checks.push({
    name,
    passed: !!condition,
    ...(status ? { status } : {}),
  });
  await save();
  if (!condition)
    throw Error(
      "Hosted synthetic check failed: " +
        name +
        (status ? " HTTP " + status : ""),
    );
}
async function call(label, operation, body = {}, override = {}) {
  if (a.deadline * 1000 <= Date.now()) throw Error("Approved window expired");
  await pause(1100);
  const f = state.people[label];
  const headers = {
    origin: a.supabase.POC_ORIGIN,
    "content-type": "application/json",
    "x-poc-access": a.supabase.POC_ACCESS_KEY,
    "x-poc-tester": hash(f.email),
    authorization: "Bearer " + (f.token || signed.sessions[label].idToken),
    cookie: f.cookie,
    ...override,
  };
  const r = await fetch(url, {
    method: "POST",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ operation, body }),
  });
  const d = await r.json();
  if (r.status === 200 && operation === "session") {
    const cookies = r.headers
      .getSetCookie()
      .filter((value) => value.startsWith("__Host-rt_phase11="));
    await check(
      label + " Secure HttpOnly Strict application cookie",
      cookies.length === 1 &&
        /Secure; HttpOnly; SameSite=Strict/.test(cookies[0]),
    );
    f.cookie = cookies[0].split(";")[0];
  }
  return { status: r.status, data: d };
}
const { member, other } = state.people;
try {
  const mode = process.argv[2];
  if (mode === "prepare" || mode === "sessions") {
    for (const label of ["admin", "member", "other"]) {
      state.people[label].token = signed.sessions[label].idToken;
      let r = await call(label, "session");
      await check(label + " real hosted session", r.status === 200, r.status);
      r = await call(label, "me");
      await check(
        label + " immutable owned identity",
        r.status === 200 && r.data.user.id === state.people[label].id,
        r.status,
      );
      await check(
        label + " payments disabled",
        r.data.paymentsEnabled === false,
      );
    }
    if (mode === "prepare") {
      for (const [op, body] of [
        ["admin", {}],
        ["grant", { userId: member.id, duration: "permanent" }],
        ["workspace", {}],
        ["profile", { name: "Escalation", role: "admin" }],
      ]) {
        const r = await call("member", op, body);
        await check(
          "ordinary member denied " + op,
          r.status === (op === "profile" ? 400 : 403),
          r.status,
        );
      }
      let r = await call("member", "me", {}, { "x-poc-access": "" });
      await check("missing server key denied", r.status === 403, r.status);
      r = await call("member", "me", {}, { authorization: "Bearer invalid" });
      await check("malformed JWT denied", r.status === 401, r.status);
      r = await call("member", "me", {}, { origin: "https://example.org" });
      await check("wrong Origin denied", r.status === 403, r.status);
      r = await call("member", "me", {}, { "x-poc-tester": hash(other.email) });
      await check("different named tester denied", r.status === 403, r.status);
      r = await call("member", "me", {}, { cookie: other.cookie });
      await check(
        "cross account app cookie denied",
        r.status === 401,
        r.status,
      );
      r = await call("admin", "admin");
      await check("synthetic admin allowed", r.status === 200, r.status);
      for (const duration of ["7d", "30d", "permanent"]) {
        r = await call("admin", "grant", { userId: member.id, duration });
        await check("admin grant " + duration, r.status === 200, r.status);
        r = await call("member", "workspace");
        await check(
          "fresh grant permits workspace " + duration,
          r.status === 200,
          r.status,
        );
        if (duration !== "permanent") {
          r = await call("admin", "revoke", { userId: member.id });
          await check("admin revoke " + duration, r.status === 200, r.status);
          r = await call("member", "workspace");
          await check(
            "fresh revocation denies workspace " + duration,
            r.status === 403,
            r.status,
          );
        }
      }
      r = await call("admin", "grant", {
        userId: other.id,
        duration: "permanent",
      });
      await check("other synthetic grant", r.status === 200, r.status);
      for (const label of ["member", "other"]) {
        state.people[label].presetIds = [];
        for (let n = 0; n < 3; n++) {
          r = await call(label, "save", {
            name: "Synthetic " + label + " " + n,
            data: { text: "Synthetic fixture " + n },
          });
          await check(
            label + " owned preset write " + n,
            r.status === 200 && typeof r.data.id === "string",
            r.status,
          );
          state.people[label].presetIds.push(r.data.id);
        }
      }
      r = await call("member", "workspace");
      await check(
        "populated owned workspace",
        r.status === 200 &&
          r.data.presets.length === 3 &&
          r.data.presets.every((p) => member.presetIds.includes(p.id)),
        r.status,
      );
      r = await call("member", "delete", { id: other.presetIds[0] });
      await check("cross user delete denied", r.status === 404, r.status);
      r = await call("other", "workspace");
      await check(
        "peer records preserved",
        r.status === 200 && r.data.presets.length === 3,
        r.status,
      );
      r = await call("member", "profile", { name: "Synthetic member updated" });
      await check("owned profile update", r.status === 200, r.status);
      r = await call("member", "export");
      await check(
        "owned export excludes peer",
        r.status === 200 &&
          r.data.user.id === member.id &&
          r.data.presets.every((p) => member.presetIds.includes(p.id)),
        r.status,
      );
    }
  } else if (["disabled", "revoked"].includes(mode)) {
    const r = await call("member", "me");
    await check(mode + " member app access denied", r.status === 401, r.status);
  } else if (mode === "expired-pro") {
    const r = await call("member", "workspace");
    await check(
      "expired grant denied by fresh database read",
      r.status === 403,
      r.status,
    );
  } else if (mode === "restore-pro") {
    let r = await call("admin", "grant", {
      userId: member.id,
      duration: "permanent",
    });
    await check(
      "synthetic grant restored for benchmark",
      r.status === 200,
      r.status,
    );
    r = await call("member", "workspace");
    await check("restored grant read freshly", r.status === 200, r.status);
  } else if (mode === "logout") {
    const old = member.cookie,
      r = await call("member", "logout");
    await check("hosted logout", r.status === 200, r.status);
    const denied = await call("member", "me", {}, { cookie: old });
    await check(
      "logged-out cookie denied",
      denied.status === 401,
      denied.status,
    );
    const replay = await call("member", "session");
    await check(
      "old identity cannot rebootstrap after logout",
      replay.status === 401,
      replay.status,
    );
  } else
    throw Error(
      "Use prepare, sessions, disabled, revoked, expired-pro or logout",
    );
  await save();
  console.log(
    JSON.stringify({
      mode,
      hosted: true,
      checks: state.checks.length,
      passed: state.checks.filter((x) => x.passed).length,
    }),
  );
} catch (e) {
  await save();
  console.error(e.message);
  process.exitCode = 1;
}
