import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import console from "node:console";
import { cpuEligible } from "./firebase-poc-evidence.mjs";
const root = ".wrangler/phase9",
  mixed = process.argv.includes("--mixed");
const work = JSON.parse(
  await readFile(
    root + (mixed ? "/workloads-mixed.json" : "/workloads.json"),
    "utf8",
  ),
);
const tail = JSON.parse(await readFile(root + "/tail-cpu.json", "utf8"));
if (
  work.project !== "randomtools-firebase-poc" ||
  work.script !== tail.script ||
  work.verifiedAccounts !== true
)
  throw Error("Verified isolated workload required");
const reports = [];
for (const s of work.samples) {
  const paths = new Set(s.attempts.map((a) => a.path));
  const events = tail.events.filter(
    (e) =>
      e.timestamp >= Date.parse(s.start) &&
      e.timestamp <= Date.parse(s.end) &&
      paths.has(e.path),
  );
  const acceptable =
    cpuEligible(s) &&
    events.length === s.requests &&
    events.every(
      (e) =>
        e.status === 200 &&
        e.outcome === "ok" &&
        Number.isFinite(e.cpuMs) &&
        !e.truncated,
    );
  if (!acceptable) {
    reports.push({
      run: s.run,
      cpuWithheld: true,
      expectedRequests: s.requests,
      observedEvents: events.length,
    });
    continue;
  }
  const values = events.map((e) => e.cpuMs).sort((a, b) => a - b);
  const q = (p) => values[Math.ceil(values.length * p) - 1];
  reports.push({
    run: s.run,
    requests: events.length,
    cpuP50ms: q(0.5),
    cpuP95ms: q(0.95),
    cpuP99ms: q(0.99),
    maxObservedCpuMs: values.at(-1),
    above10ms: values.filter((v) => v > 10).length,
    versions: [...new Set(events.map((e) => e.version))],
  });
}
const first = tail.events.find((e) => e.status === 200 && e.cpuMs !== null);
const report = {
  source: "Wrangler realtime invocation traces",
  unit: "milliseconds",
  quantileMethod: "nearest rank; whole-millisecond trace precision",
  firstObservedAuthenticatedRequest: first
    ? {
        cpuMs: first.cpuMs,
        wallMs: first.wallMs,
        version: first.version,
        limitation:
          "First observed owned request after deployment, not a guaranteed forced cold start",
      }
    : null,
  reports,
  rawSensitiveTraceDataStored: false,
};
await writeFile(
  root + (mixed ? "/cpu-tail-mixed.json" : "/cpu-tail-read.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
