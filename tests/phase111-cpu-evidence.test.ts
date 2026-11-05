import { it, expect } from "vitest";
import { cpuEvidence } from "../experiments/phase111/cpu-evidence.mjs";
const sample = () => ({
  backend: "cloudflare",
  start: new Date(1000).toISOString(),
  end: new Date(2000).toISOString(),
  eligible: true,
  cleanupVerified: true,
  failures: 0,
  requests: 2,
  attempts: [
    { authorized: true, status: 200 },
    { authorized: true, status: 200 },
  ],
});
const trace = () => ({
  script: "randomtools-phase11-baseline-api",
  events: [1, 12].map((cpuMs, i) => ({
    timestamp: 1100 + i,
    path: "/api/me",
    status: 200,
    outcome: "ok",
    version: "synthetic",
    cpuMs,
    truncated: false,
  })),
});
it("uses direct CPU only with complete successful owned coverage", () =>
  expect(cpuEvidence(sample(), trace(), "synthetic")).toMatchObject({
    withheld: false,
    n: 2,
    p50: 1,
    p99: 12,
    max: 12,
    over10ms: 1,
  }));
it.each([
  "denied",
  "missing",
  "wrong-version",
  "no-cpu",
  "truncated",
  "wrong-script",
])("withholds incomplete or invalid evidence: %s", (kind) => {
  const s = sample(),
    t = trace();
  if (kind === "denied") s.attempts[0].authorized = false;
  if (kind === "missing") t.events.pop();
  if (kind === "wrong-version") t.events[0].version = "other";
  if (kind === "no-cpu") t.events[0].cpuMs = NaN;
  if (kind === "truncated") t.events[0].truncated = true;
  if (kind === "wrong-script") t.script = "existing-production-worker";
  expect(cpuEvidence(s, t, "synthetic").withheld).toBe(true);
});
