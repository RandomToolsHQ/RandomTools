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
      if (mode === "sessions" && state.people[label].deleted === true) continue;
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
  } else if (mode === "recovery-admin-denied") {
    const r = await call("admin", "me");
    await check(
      "recovery revokes prior synthetic admin application session",
      r.status === 401,
      r.status,
    );
  } else if (mode === "delete-other") {
    const r = await call("other", "account-delete", { confirmation: "DELETE" });
    await check(
      "real owned synthetic account deletion",
      r.status === 200 && r.data.deleted === true,
      r.status,
    );
    const denied = await call("other", "me");
    await check(
      "deleted user immediately denied",
      denied.status === 401,
      denied.status,
    );
    other.deleted = true;
  } else if (mode === "concurrent") {
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        call("member", "save", {
          name: "Synthetic concurrent " + i,
          data: { text: "Bounded synthetic concurrency" },
        }),
      ),
    );
    const created = results
      .filter((r) => r.status === 200 && typeof r.data.id === "string")
      .map((r) => r.data.id);
    try {
      await check(
        "three bounded concurrent owned writes",
        created.length === 3 && new Set(created).size === 3,
      );
      const workspace = await call("member", "workspace");
      await check(
        "concurrent writes preserve exact ownership",
        workspace.status === 200 &&
          workspace.data.presets.length === 6 &&
          workspace.data.presets.every((p) =>
            [...member.presetIds, ...created].includes(p.id),
          ),
        workspace.status,
      );
    } finally {
      for (const id of created)
        await check(
          "exact concurrent fixture removed",
          (await call("member", "delete", { id })).status === 200,
        );
    }
    const workspace = await call("member", "workspace");
    await check(
      "concurrent test baseline restored",
      workspace.status === 200 &&
        workspace.data.presets.length === 3 &&
        workspace.data.presets.every((p) => member.presetIds.includes(p.id)),
      workspace.status,
    );
  } else if (mode === "expired-session") {
    const r = await call("member", "me");
    await check(
      "expired application session denied",
      r.status === 401,
      r.status,
    );
  } else if (mode === "protected-admin") {
    const r = await call("admin", "account-delete", { confirmation: "DELETE" });
    await check("admin self-deletion protected", r.status === 403, r.status);
    const profile = await call("admin", "me");
    await check(
      "protected admin record preserved",
      profile.status === 200 && profile.data.user.role === "admin",
      profile.status,
    );
  } else if (mode === "abuse") {
    const headers = {
      origin: a.supabase.POC_ORIGIN,
      "content-type": "application/json",
      "x-poc-access": a.supabase.POC_ACCESS_KEY,
      "x-poc-tester": hash(member.email),
      authorization: "Bearer invalid",
    };
    for (const [name, body, status] of [
      ["malformed JSON", "{", 400],
      ["oversized body", "x".repeat(16385), 413],
    ]) {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(15000),
      });
      await r.arrayBuffer();
      await check(
        name + " denied before provider",
        r.status === status,
        r.status,
      );
    }
    const statuses = [];
    for (let batch = 0; batch < 5; batch++)
      statuses.push(
        ...(await Promise.all(
          Array.from({ length: 5 }, async () => {
            const r = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify({ operation: "me" }),
              signal: AbortSignal.timeout(15000),
            });
            await r.arrayBuffer();
            return r.status;
          }),
        )),
      );
    await check(
      "bounded malformed-token burst is rate limited",
      statuses.includes(429) && statuses.every((x) => [401, 429].includes(x)),
    );
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
