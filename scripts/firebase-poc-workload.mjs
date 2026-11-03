import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";
import console from "node:console";
import { summarize } from "./firebase-poc-evidence.mjs";
/* global fetch, URLSearchParams, AbortSignal */
// No IAM changes, role grants or fixture creation. Requires an already verified,
// legitimately entitled synthetic member and populated owned presets.
const root = ".wrangler/phase9",
  project = "randomtools-firebase-poc";
const origin = "https://randomtools-firebase-poc.pages.dev";
const fixture = JSON.parse(await readFile(root + "/fixtures.json", "utf8"));
const web = JSON.parse(
  await readFile(root + "/firebase-web-config.json", "utf8"),
);
const member = fixture.fixtures?.find((f) => f.label === "member");
if (
  fixture.project !== project ||
  web.projectId !== project ||
  !/^phase9-[a-f0-9-]{36}$/.test(fixture.runId) ||
  !member?.uid ||
  member.email !== fixture.runId + "-member@example.com"
)
  throw Error("Unsafe synthetic workload target");
const userId =
  "firebase_" +
  createHash("sha256")
    .update("https://securetoken.google.com/" + project + "\n" + member.uid)
    .digest("hex");
const jar = new Map();
async function request(path, method = "GET", body, bearer) {
  const r = await fetch(origin + path, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: {
      origin,
      cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
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
  for (const c of r.headers.getSetCookie()) {
    const pair = c.split(";")[0],
      at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return {
    status: r.status,
    data,
    cpuLimit: /(?:Error\s*1102|CPU time limit)/i.test(text),
  };
}
const gate = await request(
  "/__staging",
  "POST",
  new URLSearchParams({ email: member.email, key: member.gateKey }),
);
if (gate.status !== 303)
  throw Error("Private gateway rejected workload; no benchmark started");
const signed = await fetch(
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
    encodeURIComponent(web.apiKey),
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: member.email,
      password: member.password,
      returnSecureToken: true,
    }),
    signal: AbortSignal.timeout(10000),
  },
);
const auth = await signed.json();
if (!signed.ok || auth.localId !== member.uid)
  throw Error("Synthetic sign-in rejected; no benchmark started");
const session = await request("/api/session", "POST", {}, auth.idToken);
if (session.status !== 200)
  throw Error(
    "Verified application session required; denied requests are not benchmark samples",
  );
let cleanupOK = false;
try {
  const me = await request("/api/me", "GET", undefined, auth.idToken);
  const presets = await request(
    "/api/pro/presets",
    "GET",
    undefined,
    auth.idToken,
  );
  function authorized(path, result) {
    return (
      result.status === 200 &&
      (path === "/api/me"
        ? result.data?.user?.id === userId && result.data?.pro === true
        : Array.isArray(result.data) &&
          result.data.length >= 3 &&
          result.data.every((p) => p.user_id === userId))
    );
  }
  if (!authorized("/api/me", me) || !authorized("/api/pro/presets", presets))
    throw Error(
      "Entitled, populated owned workspace required; no benchmark started",
    );
  // 3 x 40, sequential, at most 40 requests/minute: below POC user/IP limits.
  const work = {
    project,
    script: project + "-api",
    verifiedAccounts: true,
    samples: [],
  };
  for (let run = 1; run <= 3; run++) {
    const sample = {
      run,
      start: new Date().toISOString(),
      end: null,
      requests: 0,
      attempts: [],
    };
    for (let i = 0; i < 40; i++) {
      const path = i % 2 ? "/api/pro/presets" : "/api/me",
        begin = performance.now();
      let attempt;
      try {
        const result = await request(path, "GET", undefined, auth.idToken);
        attempt = {
          path,
          status: result.status,
          authorized: authorized(path, result),
          latencyMs: performance.now() - begin,
          errorKind: result.cpuLimit
            ? "cpu-limit"
            : /rate limited/i.test(result.data?.error || "")
              ? "provider-rate-limit"
              : result.status !== 200
                ? "http-error"
                : undefined,
        };
      } catch {
        attempt = {
          path,
          status: 0,
          authorized: false,
          latencyMs: performance.now() - begin,
          errorKind: "network-or-timeout",
        };
      }
      sample.attempts.push(attempt);
      sample.requests++;
      if (!attempt.authorized) break;
      await pause(1500);
    }
    sample.end = new Date().toISOString();
    sample.summary = summarize(sample.attempts);
    work.samples.push(sample);
    await writeFile(root + "/workloads.json", JSON.stringify(work, null, 2));
    console.log(JSON.stringify({ run, ...sample.summary }));
    // Stop provider/load errors rather than amplifying them into a concurrency test.
    if (sample.summary.failures)
      throw Error(
        "Workload failure recorded; further runs stopped. Do not use this interval as authenticated CPU evidence.",
      );
  }
} finally {
  try {
    const logout = await request("/api/logout", "POST", {}, auth.idToken);
    cleanupOK = logout.status === 200;
  } catch {
    cleanupOK = false;
  } finally {
    jar.clear();
    console.log(JSON.stringify({ benchmarkSessionCleanup: cleanupOK }));
  }
}
if (!cleanupOK) throw Error("Session cleanup needs test-operator review");
console.log(
  JSON.stringify({
    runs: 3,
    requests: 120,
    sessionRevoked: true,
    hosted: true,
  }),
);
