import { readFile, writeFile } from "node:fs/promises";
import { decodeJwt } from "jose";
import { runSample, pause } from "../experiments/supabase/benchmark.mjs";
/* global fetch, AbortSignal */
const root = ".wrangler/phase11";
let input;
try {
  input = JSON.parse(
    await readFile(root + "/benchmark-credentials.json", "utf8"),
  );
} catch {
  throw Error("Ignored benchmark credential file is missing or invalid");
}
if (
  !/^phase11-[a-f0-9-]{36}$/.test(input.runId) ||
  !input.subject ||
  !input.expectedUserId
)
  throw Error("Exact synthetic fixture required");
const target = {
  supabase:
    "https://ijlohzzqszyhncglqsfq.supabase.co/functions/v1/randomtools-phase11",
  cloudflare: "https://randomtools-phase11-baseline.pages.dev",
};
const adapters = [];
for (const kind of ["cloudflare", "supabase"]) {
  const c = input[kind];
  let claims;
  try {
    claims = decodeJwt(c.token);
  } catch {
    throw Error("Fresh synthetic token required");
  }
  if (
    claims.sub !== input.subject ||
    claims.aud !== "randomtools-supabase-auth-poc" ||
    claims.iss !==
      "https://securetoken.google.com/randomtools-supabase-auth-poc" ||
    claims.exp * 1000 - Date.now() < 1800000 ||
    claims.email_verified !== true ||
    !c.cookie ||
    !c.origin
  )
    throw Error(
      "Fresh matching synthetic identities and real sessions required",
    );
  if (
    kind === "supabase" &&
    (!/^[a-f0-9]{64}$/.test(c.key) || c.origin !== "http://127.0.0.1:54381")
  )
    throw Error("Prepared loopback harness required");
  if (kind === "cloudflare" && c.origin !== target.cloudflare)
    throw Error(
      "Isolated reference clone required; existing POC is never modified",
    );
  adapters.push({
    kind,
    userId: input.expectedUserId,
    presetIds: c.presetIds,
    async call(operation, body = {}) {
      const paths = {
        me: ["GET", "/api/me"],
        workspace: ["GET", "/api/pro/presets"],
        save: ["POST", "/api/pro/presets"],
        delete: ["DELETE", "/api/pro/presets"],
        logout: ["POST", "/api/logout"],
      };
      const [method, path] =
        kind === "supabase" ? ["POST", ""] : paths[operation];
      const r = await fetch(target[kind] + path, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: {
          origin: c.origin,
          authorization: "Bearer " + c.token,
          cookie: c.cookie,
          ...(kind === "supabase" ? { "x-poc-access": c.key } : {}),
          ...(method === "GET" ? {} : { "content-type": "application/json" }),
        },
        body:
          method === "GET"
            ? undefined
            : JSON.stringify(kind === "supabase" ? { operation, body } : body),
      });
      const raw = await r.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
      if (
        kind === "cloudflare" &&
        operation === "workspace" &&
        Array.isArray(data)
      )
        data = data.every((p) => p.user_id === input.expectedUserId)
          ? { presets: data }
          : null;
      if (kind === "cloudflare" && operation === "delete")
        data = {
          deleted:
            r.status === 200 &&
            data?.message === "Removed owned preset if present",
        };
      return {
        status: r.status,
        data,
        errorKind: /Error\s*1102|CPU time limit/i.test(raw)
          ? "cpu-limit"
          : undefined,
      };
    },
  });
}
const report = {
  project: "randomtools-phase11",
  runId: input.runId,
  measured: true,
  samples: [],
  limitations: [
    "CPU requires platform metadata",
    "No provider-throttle count without correlated provider evidence",
    "Same identity/payload, concurrency 1, 1500 ms pacing; RPC envelope differs",
    "First request is not forced cold-start evidence",
  ],
};
try {
  for (const a of adapters) {
    const me = await a.call("me"),
      workspace = await a.call("workspace");
    if (
      me.status !== 200 ||
      me.data?.user?.id !== a.userId ||
      me.data?.pro !== true ||
      workspace.status !== 200 ||
      workspace.data?.presets?.length !== 3 ||
      !Array.isArray(a.presetIds) ||
      a.presetIds.length !== 3 ||
      workspace.data.presets.some((p) => !a.presetIds.includes(p.id))
    )
      throw Error(
        "Owned verified Pro and exactly three baseline presets required",
      );
  }
  for (let run = 1; run <= 3; run++)
    for (const workload of ["reads", "mixed"])
      for (const a of run % 2 ? adapters : [...adapters].reverse()) {
        const s = await runSample(a, {
          run,
          kind: workload,
          runId: input.runId,
        });
        report.samples.push({ backend: a.kind, ...s });
        await writeFile(
          root + "/comparison.json",
          JSON.stringify(report, null, 2),
          { mode: 0o600 },
        );
        if (!s.eligible)
          throw Error(
            "Comparison stopped; rejected requests are not successful samples",
          );
        await pause(5000);
      }
} finally {
  report.logout = [];
  for (const a of adapters) {
    try {
      const r = await a.call("logout");
      report.logout.push({ backend: a.kind, verified: r.status === 200 });
    } catch {
      report.logout.push({ backend: a.kind, verified: false });
    }
  }
  await writeFile(root + "/comparison.json", JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
}
