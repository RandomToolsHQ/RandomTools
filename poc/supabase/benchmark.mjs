import { readFile } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import process from "node:process";
import console from "node:console";
import { Buffer } from "node:buffer";
/* global fetch, performance, URL, AbortSignal */

// Explicit ignored file only; never use .dev.vars.staging or genuine test sessions.
// Format: { projectRef, accessKey, token, origin, syntheticSubject }.
const path = process.env.POC_BENCH_CREDENTIAL_FILE;
if (!path || !/[\\/]\.wrangler[\\/]supabase-poc-bench\.json$/.test(path))
  throw new Error(
    "Use the ignored .wrangler/supabase-poc-bench.json credential file",
  );
const c = JSON.parse(await readFile(path, "utf8"));
if (
  !/^[a-z]{20}$/.test(c.projectRef) ||
  !/^[a-f0-9]{64}$/.test(c.accessKey) ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(c.origin)
)
  throw new Error("Invalid POC configuration");
const claims = JSON.parse(
  Buffer.from(c.token.split(".")[1], "base64url").toString(),
);
// Local checks are only accidental-credential safeguards; the SERVER verifies signatures.
if (
  claims.sub !== c.syntheticSubject ||
  !/^user_[A-Za-z0-9]+$/.test(c.syntheticSubject) ||
  claims.azp !== c.origin ||
  claims.exp * 1000 < Date.now() + 50000
)
  throw new Error(
    "Dedicated synthetic token must remain valid for the bounded workload",
  );
const url = new URL(
  `https://${c.projectRef}.supabase.co/functions/v1/randomtools-poc`,
);
const results = [];
async function call(operation, body = {}) {
  const start = performance.now();
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${c.token}`,
        "x-poc-access": c.accessKey,
        origin: c.origin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ operation, body }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    results.push({
      status: 0,
      elapsedMs: performance.now() - start,
      handlerWallMs: null,
    });
    throw new Error("Transport failed");
  }
  let result,
    malformed = false;
  try {
    result = await r.json();
  } catch {
    malformed = true;
  }
  results.push({
    status: r.status,
    malformed,
    elapsedMs: performance.now() - start,
    handlerWallMs:
      Number(/dur=([\d.]+)/.exec(r.headers.get("server-timing") || "")?.[1]) ||
      null,
  });
  if (!r.ok || malformed)
    throw new Error(
      `Workload stopped on HTTP ${r.status}; Retry-After=${r.headers.get("retry-after") || "none"}`,
    );
  return result;
}
const start = new Date().toISOString();
let completed = false;
try {
  // First request latency is a first-observed request, not proof of a cold isolate.
  await call("me");
  // 41 reads + 6 writes/deletes; fits a fresh short-lived Clerk token without
  // extending its expiry or minting an artificial long-lived benchmark token.
  for (let i = 0; i < 10; i++) {
    await pause(650);
    await call("me");
  }
  for (let i = 0; i < 6; i++) {
    await pause(3500);
    // Settle every request before stopping after a failure; do not leave background traffic.
    const batch = await Promise.allSettled(
      ["me", "workspace", "workspace", "workspace", "me"].map((op) => call(op)),
    );
    if (batch.some((r) => r.status === "rejected"))
      throw new Error("Read batch failed; further traffic stopped");
  }
  for (let i = 0; i < 3; i++) {
    await pause(3500);
    const saved = await call("save", {
      name: "POC benchmark disposable",
      data: "x".repeat(2048),
    });
    await call("delete", { id: saved.id });
  }
  completed = true;
} catch {
  // Errors here are fixed labels/status only, never raw provider errors or bodies.
  console.error(
    "Bounded workload stopped; inspect sanitized status totals and provider events.",
  );
} finally {
  const values = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const percentile = (p) =>
    values.length ? values[Math.ceil(p * values.length) - 1] : null;
  console.log(
    JSON.stringify(
      {
        kind: "hosted-poc-wall-latency",
        start,
        end: new Date().toISOString(),
        completed,
        requests: results.length,
        statuses: results.reduce(
          (s, r) => ({ ...s, [r.status]: (s[r.status] || 0) + 1 }),
          {},
        ),
        firstObservedMs: results[0]?.elapsedMs,
        medianMs: percentile(0.5),
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
        cpuMs: null,
        cpuNote:
          "Use provider shutdown cpu_time_used with execution IDs; wall time is not CPU. Do not divide shared-isolate CPU into per-request quantiles.",
      },
      null,
      2,
    ),
  );
}
if (!completed) process.exitCode = 1;
