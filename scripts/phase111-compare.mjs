import { readFile, writeFile } from "node:fs/promises";
import { cpuEvidence } from "../experiments/phase111/cpu-evidence.mjs";
import console from "node:console";
const root = ".wrangler/phase111/private";
const report = JSON.parse(await readFile(root + "/comparison.json", "utf8"));
const trace = JSON.parse(await readFile(root + "/tail-cpu.json", "utf8"));
if (
  report.project !== "randomtools-phase11" ||
  !/^phase11-[a-f0-9-]{36}$/.test(report.runId) ||
  report.samples.length !== 12 ||
  !trace.endedAt
)
  throw Error("Complete bounded matched comparison and stopped trace required");
const rows = report.samples.map((s) => ({
  backend: s.backend,
  run: s.run,
  kind: s.kind,
  requests: s.requests,
  successes: s.successes,
  failures: s.failures,
  eligible: s.eligible,
  cleanupVerified: s.cleanupVerified,
  latencyP50ms: s.latencyP50ms,
  latencyP95ms: s.latencyP95ms,
  latencyP99ms: s.latencyP99ms,
  maxLatencyMs: s.maxLatencyMs,
  cpuLimitErrors: s.cpuLimitErrors,
  authenticationOrAuthorizationFailures:
    s.authenticationOrAuthorizationFailures,
  applicationRateLimitResponses: s.applicationRateLimitResponses,
  unclassifiedDependencyFailures: s.unclassifiedDependencyFailures,
  providerThrottles: s.providerThrottles,
  cpu:
    s.backend === "cloudflare"
      ? cpuEvidence(s, trace, "26abd500-9bc2-491d-9912-1523c042818e")
      : null,
}));
await writeFile(
  root + "/comparison-cpu.json",
  JSON.stringify(
    {
      runId: report.runId,
      rows,
      limitations: [
        ...report.limitations,
        "CPU quantiles use nearest rank; 12-request mixed p95/p99 are the maximum",
        "Supabase per-request CPU is not inferred from latency",
      ],
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(rows, null, 2));
