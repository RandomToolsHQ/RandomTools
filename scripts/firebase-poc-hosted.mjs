// Operator-only hosted tests. No privileged Google credential is accepted here.
// Google administrative actions run separately in the approved Cloud Shell.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import console from "node:console";
/* global fetch, AbortSignal, URLSearchParams */
import { execFileSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { summarize } from "./firebase-poc-evidence.mjs";

const root = ".wrangler/phase9",
  project = "randomtools-firebase-poc";
const origin = "https://randomtools-firebase-poc.pages.dev";
const database = "caf619cb-a7c4-46fe-b5ac-c8245827d16a";
const issuer = "https://securetoken.google.com/" + project;
const fixtures = JSON.parse(await fs.readFile(root + "/fixtures.json", "utf8"));
const web = JSON.parse(
  await fs.readFile(root + "/firebase-web-config.json", "utf8"),
);
const hash = (v) => createHash("sha256").update(v).digest("hex");
if (
  fixtures.project !== project ||
  web.projectId !== project ||
  !/^phase9-[a-f0-9-]{36}$/.test(fixtures.runId) ||
  fixtures.fixtures.length !== 3 ||
  fixtures.fixtures.some(
    (f) =>
      !["admin", "member", "other"].includes(f.label) ||
      f.email !== fixtures.runId + "-" + f.label + "@example.com" ||
      !f.uid ||
      !f.password ||
      !f.gateKey,
  )
)
  throw Error("Exact recorded synthetic fixtures required");
const people = Object.fromEntries(
  fixtures.fixtures.map((f) => [
    f.label,
    { ...f, userId: "firebase_" + hash(issuer + "\n" + f.uid), cookies: {} },
  ]),
);
const ids = Object.values(people).map((f) => f.userId);
let state;
try {
  state = JSON.parse(await fs.readFile(root + "/hosted-state.json", "utf8"));
} catch {
  state = {
    project,
    runId: fixtures.runId,
    checks: [],
    people: {},
    rolePending: false,
  };
}
if (state.project !== project || state.runId !== fixtures.runId)
  throw Error("Hosted ledger mismatch");
for (const [label, p] of Object.entries(state.people)) {
  if (p.userId !== people[label]?.userId)
    throw Error("Stored identity mismatch");
  Object.assign(people[label], p);
}
const cfAuth = JSON.parse(
  execFileSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "auth", "token", "--json"],
    { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  ),
);
async function save() {
  state.people = Object.fromEntries(
    Object.entries(people).map(([k, f]) => [
      k,
      {
        userId: f.userId,
        cookies: f.cookies,
        token: f.token,
        refreshToken: f.refreshToken,
        second: f.second,
      },
    ]),
  );
  await fs.writeFile(
    root + "/hosted-state.json",
    JSON.stringify(state, null, 2),
  );
  await fs.writeFile(
    root + "/hosted-lifecycle.json",
    JSON.stringify(
      {
        project,
        runId: state.runId,
        hosted: true,
        rolePending: state.rolePending,
        checks: state.checks,
      },
      null,
      2,
    ),
  );
}
async function check(name, good, status) {
  state.checks.push({ name, passed: !!good, ...(status ? { status } : {}) });
  await save();
  if (!good) throw Error("Hosted synthetic check failed: " + name);
}
async function sql(statement, params = []) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/5c172e2e4c51cfc7dc512c96825b2912/d1/database/${database}/query`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + cfAuth.token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql: statement, params }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const d = await r.json();
  if (!r.ok || !d.success || d.result.some((x) => !x.success))
    throw Error("Isolated D1 query failed, HTTP " + r.status);
  return d.result[0];
}
const marker = await sql(
  "SELECT value FROM poc_metadata WHERE key='isolation'",
);
if (marker.results[0]?.value !== project + "-v1")
  throw Error("Isolated database marker required");
const unrelated = await sql(
  `SELECT count(*) AS n FROM users WHERE id NOT IN (?,?,?)`,
  ids,
);
if (unrelated.results[0].n !== 0)
  throw Error("Unexpected accounts in isolated database; refuse mutation");
async function client(f, op, body) {
  const r = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:" +
      op +
      "?key=" +
      encodeURIComponent(web.apiKey),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    },
  );
  return { status: r.status, data: await r.json() };
}
async function request(
  f,
  path,
  method = "GET",
  body,
  bearer = f?.token,
  paced = true,
) {
  if (paced) await pause(750); // Keep functional negative tests out of CPU intervals.
  const r = await fetch(origin + path, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: {
      origin,
      cookie: Object.entries(f?.cookies || {})
        .map(([k, v]) => k + "=" + v)
        .join("; "),
      ...(bearer ? { authorization: "Bearer " + bearer } : {}),
      ...(body
        ? {
            "content-type":
              body instanceof URLSearchParams
                ? "application/x-www-form-urlencoded"
                : "application/json",
          }
        : {}),
    },
    body:
      body instanceof URLSearchParams
        ? body
        : body
          ? JSON.stringify(body)
          : undefined,
  });
  for (const value of r.headers.getSetCookie()) {
    const pair = value.split(";")[0],
      at = pair.indexOf("=");
    if (f) f.cookies[pair.slice(0, at)] = pair.slice(at + 1);
  }
  let data;
  const responseText = await r.text();
  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }
  return {
    status: r.status,
    data,
    cpuLimit: /(?:Error\s*1102|CPU time limit)/i.test(responseText),
  };
}
async function signIn(f) {
  const existingGate = f.cookies["__Host-rt_staging"]
    ? await request(f, "/")
    : null;
  if (existingGate?.status === 200) {
    await check(
      f.label + " existing named gateway cookie verified by server",
      true,
    );
  } else {
    const g = await request(
      f,
      "/__staging",
      "POST",
      new URLSearchParams({ email: f.email, key: f.gateKey }),
      undefined,
    );
    await check(f.label + " named gateway", g.status === 303, g.status);
  }
  const signed = await client(f, "signInWithPassword", {
    email: f.email,
    password: f.password,
    returnSecureToken: true,
  });
  await check(
    f.label + " actual Firebase password sign-in",
    signed.status === 200 && signed.data.localId === f.uid,
    signed.status,
  );
  f.token = signed.data.idToken;
  f.refreshToken = signed.data.refreshToken;
  const session = await request(f, "/api/session", "POST", {});
  await check(
    f.label + " verified hosted application session",
    session.status === 200,
    session.status,
  );
  const me = await request(f, "/api/me");
  await check(
    f.label + " immutable D1 identity",
    me.status === 200 && me.data?.user?.id === f.userId,
    me.status,
  );
  await save();
}
const trigger = "poc_test_role_" + fixtures.runId.replaceAll("-", "_");
async function role(value) {
  const f = people.admin;
  if (value === "admin") {
    state.rolePending = true;
    await save();
  }
  await sql(
    `CREATE TRIGGER IF NOT EXISTS ${trigger} AFTER UPDATE OF role ON users WHEN NEW.id='${f.userId}' AND OLD.role<>NEW.role BEGIN INSERT INTO audit_logs VALUES(lower(hex(randomblob(16))),NEW.id,'poc.test.role.'||NEW.role,NEW.id,unixepoch()); END;`,
  );
  const r = await sql(
    "UPDATE users SET role=? WHERE id=? AND email=? AND password_hash='managed:firebase' AND EXISTS(SELECT 1 FROM auth_identities WHERE issuer=? AND subject=? AND user_id=users.id AND state='active')",
    [value, f.userId, f.email, issuer, f.uid],
  );
  const actual = await sql(
    "SELECT role FROM users WHERE id=? AND email=? AND password_hash='managed:firebase'",
    [f.userId, f.email],
  );
  // D1's change count includes the audit trigger; verify the committed row.
  if (r.meta.changes < 1 || actual.results[0]?.role !== value)
    throw Error("Synthetic role transition refused");
  state.rolePending = value === "admin";
  await save();
}
async function grants(f) {
  return (
    (
      await request(
        people.admin,
        "/api/admin/pro-access?status=all&userId=" + f.userId,
      )
    ).data?.grants || []
  );
}
async function grant(f, duration) {
  const r = await request(
    people.admin,
    "/api/admin/pro-access/grants",
    "POST",
    { userId: f.userId, duration },
  );
  await check("direct " + duration + " grant", r.status === 200, r.status);
  return (await grants(f)).find((g) => !g.revoked_at);
}
async function revoke(g) {
  const r = await request(
    people.admin,
    "/api/admin/pro-access/revoke",
    "POST",
    { id: g.id, reason: "Synthetic hosted validation cleanup" },
  );
  await check("audited Pro revocation", r.status === 200, r.status);
}
async function finishPreparation() {
  const { member, other } = people;
  let r;
  const cross = {
    ...member,
    cookies: {
      ...member.cookies,
      ["__Host-rt_firebase_poc"]: other.cookies["__Host-rt_firebase_poc"],
    },
  };
  r = await request(cross, "/api/me");
  await check(
    "cross account application cookie denied with matching gateway",
    r.status === 401,
    r.status,
  );
  const malformed = await request(member, "/api/pro/presets", "POST", {
    name: "Invalid",
    data: [],
    role: "admin",
  });
  await check(
    "malformed workspace input denied",
    malformed.status === 400,
    malformed.status,
  );
  const payments = await request(
    member,
    "/api/subscription/checkout",
    "POST",
    {},
  );
  await check(
    "payments remain disabled",
    payments.status === 404,
    payments.status,
  );
  member.second = { cookies: { ...member.cookies }, token: member.token };
  const another = await request(member, "/api/session", "POST", {});
  await check(
    "second distinct application session created",
    another.status === 200 &&
      member.cookies["__Host-rt_firebase_poc"] !==
        member.second.cookies["__Host-rt_firebase_poc"],
  );
  await check(
    "second owned session before revocation",
    (await request(member.second, "/api/me")).status === 200,
  );

  await save();
}

const mode = process.argv[2];
try {
  if (mode === "restore-role") {
    await role("free");
    await check(
      "temporary synthetic admin restored to ordinary member",
      !state.rolePending,
    );
  } else if (mode === "prepare") {
    if (state.rolePending)
      throw Error("A previous temporary role requires cleanup first");
    const anonymous = await request(null, "/api/admin");
    await check(
      "anonymous gateway denial",
      anonymous.status === 403,
      anonymous.status,
    );
    for (const f of Object.values(people)) {
      const old = f.idToken;
      await signIn(f);
      if (
        old &&
        JSON.parse(Buffer.from(old.split(".")[1], "base64url").toString()).exp <
          Date.now() / 1000
      ) {
        const expired = await request(f, "/api/me", "GET", undefined, old);
        await check(
          f.label + " genuinely expired Google token denied",
          expired.status === 401,
          expired.status,
        );
      }
    }
    const { admin, member, other } = people;
    for (const path of ["/api/admin", "/api/pro/presets"]) {
      const r = await request(member, path);
      await check("ordinary member denied " + path, r.status === 403, r.status);
    }
    const injection = await request(member, "/api/account", "PATCH", {
      name: "Synthetic",
      role: "admin",
      pro: true,
    });
    await check(
      "client privilege injection denied",
      injection.status === 400,
      injection.status,
    );
    const self = await request(member, "/api/admin/pro-access/grants", "POST", {
      userId: member.userId,
      duration: "permanent",
    });
    await check("ordinary self grant denied", self.status === 403, self.status);
    await role("admin");
    const view = await request(admin, "/api/admin");
    await check(
      "scoped synthetic admin authorized",
      view.status === 200 &&
        view.data.audit.some((a) => a.action === "poc.test.role.admin"),
      view.status,
    );
    const protectedAdmin = await request(admin, "/api/account", "DELETE", {
      confirmation: "DELETE",
    });
    await check(
      "admin self deletion protected",
      protectedAdmin.status === 403,
      protectedAdmin.status,
    );
    let r = await request(member, "/api/pro-access/requests", "POST", {
      reason: "Synthetic hosted test",
    });
    await check("Pro request submitted", r.status === 201, r.status);
    const first = r.data.id;
    r = await request(member, "/api/pro-access/requests", "POST", {});
    await check("duplicate pending request denied", r.status === 409, r.status);
    r = await request(admin, "/api/admin/pro-access/requests", "POST", {
      id: first,
      decision: "denied",
    });
    await check("request denial audited", r.status === 200, r.status);
    r = await request(member, "/api/pro-access");
    await check(
      "member sees denied request",
      r.data.requests[0]?.status === "denied",
    );
    r = await request(member, "/api/pro-access/requests", "POST", {
      reason: "Synthetic second request",
    });
    await check("new request after denial", r.status === 201, r.status);
    const second = r.data.id;
    r = await request(admin, "/api/admin/pro-access/requests", "POST", {
      id: second,
      decision: "approved",
      duration: "7d",
    });
    await check("seven day request approval", r.status === 200, r.status);
    let active = (await grants(member)).find((g) => !g.revoked_at);
    await check(
      "seven day secure expiry recorded",
      active?.duration === "7d" &&
        active.expires_at - active.granted_at === 604800,
    );
    await revoke(active);
    r = await request(member, "/api/pro/presets");
    await check("revoked Pro denied immediately", r.status === 403, r.status);
    active = await grant(member, "30d");
    await check(
      "thirty day secure expiry recorded",
      active?.expires_at - active?.granted_at === 2592000,
    );
    // Move the exact synthetic grant into the past while retaining its duration
    // invariant. This tests real hosted fresh authorization without waiting 30d.
    const expiryTrigger = trigger + "_expiry";
    await sql(
      `CREATE TRIGGER IF NOT EXISTS ${expiryTrigger} AFTER UPDATE OF expires_at ON pro_grants WHEN NEW.user_id='${member.userId}' BEGIN INSERT INTO audit_logs VALUES(lower(hex(randomblob(16))),NEW.user_id,'poc.test.grant.expire',NEW.id,unixepoch()); END;`,
    );
    await sql(
      "UPDATE pro_grants SET granted_at=unixepoch()-100,expires_at=unixepoch()-1 WHERE id=? AND user_id=?",
      [active.id, member.userId],
    );
    await sql(`DROP TRIGGER ${expiryTrigger}`);
    r = await request(member, "/api/pro/presets");
    await check(
      "expired Pro denied despite historical approval",
      r.status === 403,
      r.status,
    );
    active = await grant(member, "permanent");
    await check(
      "permanent grant has explicit null expiry",
      active?.expires_at === null,
    );
    await grant(other, "permanent");
    for (const f of [member, other]) {
      for (let n = 0; n < 3; n++) {
        r = await request(f, "/api/pro/presets", "POST", {
          name: "Synthetic " + f.label + " " + n,
          data: { text: "Synthetic fixture " + n },
        });
        await check(
          f.label + " owned preset write " + n,
          r.status === 200,
          r.status,
        );
      }
    }
    const mine = (await request(member, "/api/pro/presets")).data;
    const theirs = (await request(other, "/api/pro/presets")).data;
    await check(
      "populated workspace ownership isolation",
      mine.length === 3 &&
        theirs.length === 3 &&
        mine.every((p) => p.user_id === member.userId) &&
        theirs.every((p) => p.user_id === other.userId),
    );
    r = await request(member, "/api/pro/presets", "DELETE", {
      id: theirs[0].id,
    });
    await check(
      "cross account deletion cannot remove record",
      r.status === 200 &&
        (await request(other, "/api/pro/presets")).data.length === 3,
    );
    r = await request(member, "/api/account/export");
    await check(
      "owned account export excludes peer data",
      r.status === 200 &&
        r.data.profile.id === member.userId &&
        r.data.saved_presets.every((p) => p.user_id === member.userId),
    );
    await finishPreparation();
    await save();
  } else if (mode === "complete-prepare") {
    if (!state.rolePending)
      throw Error("Expected scoped synthetic admin ledger");
    await finishPreparation();
  } else if (mode === "enabled") {
    await signIn(people.member);
    people.member.second = {
      cookies: { ...people.member.cookies },
      token: people.member.token,
    };
    await signIn(people.member);
    await check(
      "two independently authorized sessions after re-enable",
      (await request(people.member.second, "/api/me")).status === 200,
    );
  } else if (mode === "disabled" || mode === "revoked") {
    const member = people.member;
    for (const [label, f] of [
      ["primary", member],
      ["second", member.second],
    ]) {
      const r = await request(f, "/api/me");
      await check(
        mode + " member loses " + label + " session immediately",
        r.status === 401,
        r.status,
      );
    }
    if (mode === "revoked") {
      const r = await fetch(
        "https://securetoken.googleapis.com/v1/token?key=" +
          encodeURIComponent(web.apiKey),
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: member.refreshToken,
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      await check(
        "provider revoked refresh token denied",
        r.status === 400,
        r.status,
      );
    }
  } else if (mode === "reconnect") {
    await pause(2000);
    await signIn(people.member);
  } else if (mode === "resume") {
    await pause(2000);
    await signIn(people.member);
    await check(
      "fresh session keeps current Pro after provider revocation",
      (await request(people.member, "/api/me")).data?.pro === true,
    );
    const member = people.member;
    const raw = member.cookies.__Host_rt_firebase_poc;
    const cookieValue = member.cookies["__Host-rt_firebase_poc"] || raw;
    if (!cookieValue) throw Error("Expected hosted application cookie");
    await sql(
      "UPDATE sessions SET expires_at=unixepoch()-1 WHERE token_hash=? AND user_id=?",
      [hash(cookieValue), member.userId],
    );
    let r = await request(member, "/api/me");
    await check(
      "expired application session denied",
      r.status === 401,
      r.status,
    );
    await signIn(member);
    const before = { ...member, cookies: { ...member.cookies } };
    r = await request(member, "/api/logout", "POST", {});
    await check(
      "hosted logout revokes app sessions",
      r.status === 200,
      r.status,
    );
    await check(
      "logged out cookie cannot authorize",
      (await request(before, "/api/me")).status === 401,
    );
    await check(
      "old identity cannot bootstrap after logout",
      (await request(before, "/api/session", "POST", {})).status === 401,
    );
    await pause(2000);
    await signIn(member);
  } else if (mode === "recheck") {
    const member = people.member;
    let r = await request(member, "/api/me");
    await check(
      "deployed candidate verified owned Pro session",
      r.status === 200 &&
        r.data?.user?.id === member.userId &&
        r.data.pro === true,
      r.status,
    );
    r = await request(member, "/api/pro/presets");
    await check(
      "deployed candidate populated owned workspace",
      r.status === 200 &&
        r.data.length === 3 &&
        r.data.every((p) => p.user_id === member.userId),
      r.status,
    );
    await check(
      "deployed candidate ordinary admin denial",
      (await request(member, "/api/admin")).status === 403,
    );
    await check(
      "deployed candidate existing admin authorization",
      (await request(people.admin, "/api/admin")).status === 200,
    );
    await check(
      "deployed candidate invalid token denial",
      (await request(member, "/api/me", "GET", undefined, "invalid")).status ===
        401,
    );
    await check(
      "deployed candidate IP provider remains disabled",
      (
        await request(member, "/api/pro/ip-lookup", "POST", {
          ip: "1.1.1.1",
          consent: true,
        })
      ).status === 503,
    );
    const anonymous = await request(null, "/api/pro/presets");
    await check(
      "deployed candidate anonymous API denial",
      anonymous.status === 403,
      anonymous.status,
    );
  } else if (mode === "mixed-benchmark") {
    const f = people.member,
      tag = "benchmark_" + Date.now();
    await pause(2000);
    await signIn(f);
    const work = {
      project,
      script: project + "-api",
      verifiedAccounts: true,
      kind: "mixed-owned-crud",
      samples: [],
    };
    let pendingId = null;
    try {
      for (let run = 1; run <= 3; run++) {
        const sample = {
          run,
          start: new Date().toISOString(),
          end: null,
          requests: 0,
          attempts: [],
        };
        for (let i = 0; i < 12; i++) {
          const step = i % 4;
          const path = step === 3 ? "/api/me" : "/api/pro/presets";
          const method = step === 0 ? "POST" : step === 2 ? "DELETE" : "GET";
          const body =
            step === 0
              ? {
                  name: "Synthetic benchmark transient",
                  data: {
                    syntheticBenchmark: tag,
                    text: "synthetic ".repeat(50),
                  },
                }
              : step === 2
                ? { id: pendingId }
                : undefined;
          const begin = performance.now();
          let status = 0,
            authorized = false;
          try {
            const r = await request(f, path, method, body, f.token, false);
            status = r.status;
            if (step === 0) {
              authorized =
                status === 200 &&
                typeof r.data?.id === "string" &&
                /^[a-f0-9-]{36}$/.test(r.data.id);
              if (authorized) pendingId = r.data.id;
            } else if (step === 1)
              authorized =
                status === 200 &&
                Array.isArray(r.data) &&
                r.data.length >= 4 &&
                r.data.every((p) => p.user_id === f.userId) &&
                r.data.some((p) => p.id === pendingId);
            else if (step === 2)
              authorized =
                status === 200 &&
                !!pendingId &&
                r.data?.message === "Removed owned preset if present";
            else
              authorized =
                status === 200 &&
                r.data?.user?.id === f.userId &&
                r.data.pro === true;
          } catch {
            /* Failed requests remain failed benchmark samples. */
          }
          sample.attempts.push({
            path,
            method,
            status,
            authorized,
            latencyMs: performance.now() - begin,
            ...(!authorized
              ? {
                  errorKind: status
                    ? "http-or-ownership-error"
                    : "network-or-timeout",
                }
              : {}),
          });
          sample.requests++;
          if (!authorized) break;
          await pause(1500);
        }
        sample.end = new Date().toISOString();
        sample.summary = summarize(sample.attempts);
        work.samples.push(sample);
        await fs.writeFile(
          root + "/workloads-mixed.json",
          JSON.stringify(work, null, 2),
        );
        console.log(JSON.stringify({ mixedRun: run, ...sample.summary }));
        if (sample.summary.failures)
          throw Error(
            "Mixed workload failed; stop and withhold its CPU interval",
          );
      }
    } finally {
      const own = (await request(f, "/api/pro/presets")).data;
      await check(
        "mixed cleanup ownership verified",
        Array.isArray(own) && own.every((p) => p.user_id === f.userId),
      );
      for (const p of own) {
        let data;
        try {
          data = JSON.parse(p.data);
        } catch {
          continue;
        }
        if (data.syntheticBenchmark === tag)
          await request(f, "/api/pro/presets", "DELETE", { id: p.id });
      }
      await request(f, "/api/logout", "POST", {});
    }
  } else if (mode === "quota") {
    const f = people.member,
      prefix = "poc_quota_" + state.runId + "_";
    await signIn(f);
    const before = (
      await sql("SELECT count(*) AS n FROM saved_presets WHERE user_id=?", [
        f.userId,
      ])
    ).results[0].n;
    if (before !== 3)
      throw Error(
        "Expected three identified synthetic presets before quota test",
      );
    const qTrigger = trigger + "_quota";
    let quotaFailure;
    await sql(
      `CREATE TRIGGER ${qTrigger} AFTER INSERT ON saved_presets WHEN NEW.id='${prefix}1' AND NEW.user_id='${f.userId}' BEGIN INSERT INTO audit_logs VALUES(lower(hex(randomblob(16))),NEW.user_id,'poc.test.quota.seed',NEW.user_id,unixepoch()); END;`,
    );
    try {
      await sql(
        "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<97) INSERT INTO saved_presets SELECT ?||x,?,'preset','Synthetic quota fixture','{}',unixepoch() FROM n",
        [prefix, f.userId],
      );
      const r = await request(f, "/api/pro/presets", "POST", {
        name: "Refused quota record",
        data: {},
      });
      await check("hosted 101st preset refused", r.status === 409, r.status);
      await check(
        "hosted quota leaves exactly 100 owned records",
        (
          await sql("SELECT count(*) AS n FROM saved_presets WHERE user_id=?", [
            f.userId,
          ])
        ).results[0].n === 100,
      );
    } catch (error) {
      quotaFailure = error;
    }
    {
      const identified = (
        await sql(
          "SELECT count(*) AS n FROM saved_presets WHERE user_id=? AND id LIKE ? AND name='Synthetic quota fixture' AND data='{}'",
          [f.userId, prefix + "%"],
        )
      ).results[0].n;
      if (identified !== 97)
        throw Error("Unexpected quota fixture count; no deletion attempted");
      await sql(
        "DELETE FROM saved_presets WHERE user_id=? AND id LIKE ? AND name='Synthetic quota fixture' AND data='{}'",
        [f.userId, prefix + "%"],
      );
      await sql(`DROP TRIGGER ${qTrigger}`);
      await check(
        "identified quota fixtures removed preserving original three",
        (
          await sql("SELECT count(*) AS n FROM saved_presets WHERE user_id=?", [
            f.userId,
          ])
        ).results[0].n === 3,
      );
    }
    if (quotaFailure) throw quotaFailure;
  } else if (mode === "cleanup-api") {
    const { admin, member, other } = people;
    await signIn(admin);
    for (const f of [member, other])
      for (const g of await grants(f)) if (!g.revoked_at) await revoke(g);
    const audit = (await request(admin, "/api/admin")).data?.audit || [];
    for (const action of [
      "pro.request.submit",
      "pro.request.deny",
      "pro.request.approve",
      "pro.grant:7d",
      "pro.grant:30d",
      "pro.grant:permanent",
      "pro.grant.revoke",
    ])
      await check(
        "hosted audit includes " + action,
        audit.some((a) => a.action === action),
      );
    await role("free");
    await check(
      "former admin immediately denied",
      (await request(admin, "/api/admin")).status === 403,
    );
    await check(
      "former admin loses inherent Pro",
      (await request(admin, "/api/me")).data?.pro === false,
    );
    await check(
      "former admin Pro endpoint denied",
      (await request(admin, "/api/pro/presets")).status === 403,
    );
    await pause(2000);
    await signIn(member);
    const old = { ...member, cookies: { ...member.cookies } };
    const deleted = await request(member, "/api/account", "DELETE", {
      confirmation: "DELETE",
    });
    await check(
      "real hosted account deletion",
      deleted.status === 200,
      deleted.status,
    );
    await check(
      "deleted member loses app access",
      (await request(old, "/api/me")).status === 401,
    );
    await check(
      "deleted member cannot sign in at Firebase",
      (
        await client(member, "signInWithPassword", {
          email: member.email,
          password: member.password,
          returnSecureToken: true,
        })
      ).status === 400,
    );
    const remaining = await sql("SELECT count(*) AS n FROM users WHERE id=?", [
      member.userId,
    ]);
    await check(
      "deleted member D1 data cascades",
      remaining.results[0].n === 0 &&
        (
          await sql("SELECT count(*) AS n FROM saved_presets WHERE user_id=?", [
            member.userId,
          ])
        ).results[0].n === 0,
    );
  } else if (mode === "cleanup-db") {
    if (state.rolePending)
      throw Error("Restore synthetic admin before database cleanup");
    for (const f of [people.admin, people.other]) {
      if ((await request(f, "/")).status !== 200) {
        const gate = await request(
          f,
          "/__staging",
          "POST",
          new URLSearchParams({ email: f.email, key: f.gateKey }),
          undefined,
        );
        await check(
          f.label + " cleanup gateway renewed",
          gate.status === 303,
          gate.status,
        );
      }
      const r = await request(f, "/api/me");
      await check(
        "provider deleted " + f.label + " loses app access",
        r.status === 401,
        r.status,
      );
      const deletionTrigger = trigger + "_cleanup";
      await sql(
        `CREATE TRIGGER IF NOT EXISTS ${deletionTrigger} AFTER DELETE ON users WHEN OLD.id='${f.userId}' BEGIN INSERT INTO audit_logs VALUES(lower(hex(randomblob(16))),OLD.id,'poc.test.cleanup',OLD.id,unixepoch()); END;`,
      );
      await sql(
        "UPDATE auth_identities SET state='deleted' WHERE issuer=? AND subject=? AND user_id=?",
        [issuer, f.uid, f.userId],
      );
      await sql(
        "DELETE FROM users WHERE id=? AND email=? AND role='free' AND password_hash='managed:firebase'",
        [f.userId, f.email],
      );
      await sql(`DROP TRIGGER ${deletionTrigger}`);
    }
    await sql(`DROP TRIGGER IF EXISTS ${trigger}`);
    const counts = (
      await sql(
        "SELECT (SELECT count(*) FROM users) AS users,(SELECT count(*) FROM pro_grants) AS grants,(SELECT count(*) FROM sessions) AS sessions,(SELECT count(*) FROM saved_presets) AS presets",
      )
    ).results[0];
    await check(
      "synthetic application records removed",
      Object.values(counts).every((n) => n === 0),
    );
  } else
    throw Error(
      "Use prepare, disabled, revoked, resume, cleanup-api or cleanup-db",
    );
  await save();
  console.log(
    JSON.stringify({
      mode,
      hosted: true,
      checks: state.checks.length,
      passed: state.checks.filter((x) => x.passed).length,
      rolePending: state.rolePending,
    }),
  );
} catch (error) {
  // Do not echo provider responses, passwords, keys, cookies or JWTs.
  await save();
  console.error(error instanceof Error ? error.message : "Hosted test failed");
  process.exitCode = 1;
}
