import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import console from "node:console";
/* global fetch */

// Read-only analytics. OAuth stays in memory; no request bodies/identities logged.
// Use an isolated workload time window; aggregated CPU is not proof of real auth.
const end = process.env.WORKER_CPU_END || new Date().toISOString();
const start =
  process.env.WORKER_CPU_START || new Date(Date.now() - 3600000).toISOString();
if (
  !Number.isFinite(Date.parse(start)) ||
  !Number.isFinite(Date.parse(end)) ||
  Date.parse(start) >= Date.parse(end)
)
  throw Error("Invalid CPU measurement interval");
const { token } = JSON.parse(
  execFileSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "auth", "token", "--json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  ),
);
const query = `query($account:string,$start:string,$end:string){viewer{accounts(filter:{accountTag:$account}){workersInvocationsAdaptive(limit:100,filter:{scriptName:"randomtools-api-staging",datetime_geq:$start,datetime_leq:$end}){sum{requests errors subrequests} quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99} dimensions{status}}}}}`;
const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query,
    variables: { account: "5c172e2e4c51cfc7dc512c96825b2912", start, end },
  }),
});
const result = await response.json();
if (!response.ok || result.errors?.length)
  throw Error(
    `Cloudflare CPU analytics unavailable (HTTP ${response.status}, GraphQL codes: ${(result.errors || []).map((error) => (typeof error.extensions?.code === "number" ? error.extensions.code : "query-error")).join(",") || "none"}). Retry later; check permissions if persistent.`,
  );
const report = {
  start,
  end,
  script: "randomtools-api-staging",
  sourceUnits: "microseconds",
  groups: result.data.viewer.accounts[0].workersInvocationsAdaptive.map(
    (row) => ({
      status: row.dimensions.status,
      requests: row.sum.requests,
      errors: row.sum.errors,
      cpuP50Milliseconds: row.quantiles.cpuTimeP50 / 1000,
      cpuP95Milliseconds: row.quantiles.cpuTimeP95 / 1000,
      cpuP99Milliseconds: row.quantiles.cpuTimeP99 / 1000,
    }),
  ),
  limitation:
    "Aggregated invocations, potentially sampled and across versions. Runtime errors do not count caught HTTP 500/503 responses; cross-check the browser workload report. This does not establish authenticated Free-plan compatibility.",
};
await writeFile(
  ".wrangler/phase3-cpu-latest.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
