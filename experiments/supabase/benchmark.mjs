// Matched backend comparison. Never uploads credentials or starts cloud resources.
import { summarize } from "../../scripts/firebase-poc-evidence.mjs";
import { setTimeout } from "node:timers";
import { performance } from "node:perf_hooks";
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function runSample(adapter, { run, kind, runId, sleep = pause }) {
  const attempts = [],
    created = new Set();
  const start = new Date().toISOString();
  async function call(operation, body = {}, expectedId) {
    const began = performance.now();
    let result;
    try {
      result = await adapter.call(operation, body);
    } catch {
      result = { status: 0, errorKind: "network-or-timeout" };
    }
    const owned =
      result.status === 200 &&
      (operation === "me"
        ? result.data?.user?.id === adapter.userId && result.data.pro === true
        : operation === "workspace"
          ? Array.isArray(result.data?.presets) &&
            result.data.presets.length === (expectedId ? 4 : 3) &&
            result.data.presets.every(
              (p) =>
                typeof p.id === "string" &&
                [...adapter.presetIds, expectedId].includes(p.id),
            ) &&
            (!expectedId ||
              result.data.presets.some((p) => p.id === expectedId))
          : operation === "save"
            ? typeof result.data?.id === "string"
            : operation === "delete"
              ? result.data?.deleted === true
              : false);
    attempts.push({
      operation,
      status: result.status,
      authorized: owned,
      latencyMs: performance.now() - began,
      errorKind:
        result.errorKind || (!owned ? "http-or-ownership-error" : undefined),
    });
    if (!owned)
      throw Error("Stop workload on rejected or unexpected owned response");
    return result.data;
  }
  let error;
  try {
    if (kind === "reads") {
      for (let i = 0; i < 40; i++) {
        await call(i % 2 ? "workspace" : "me");
        await sleep(1500);
      }
    } else if (kind === "mixed") {
      for (let i = 0; i < 3; i++) {
        const saved = await call("save", {
          name: `phase11-${runId}-${run}-${i}`,
          data: { text: "x".repeat(512) },
        });
        created.add(saved.id);
        await sleep(1500);
        await call("workspace", {}, saved.id);
        await sleep(1500);
        await call("delete", { id: saved.id });
        created.delete(saved.id);
        await sleep(1500);
        await call("me");
        await sleep(1500);
      }
    } else throw Error("Unknown workload");
  } catch (e) {
    error = e;
  }
  const end = new Date().toISOString();
  const cleanup = [];
  for (const id of created) {
    // Exact IDs returned by this run's successful create only; no broad deletion.
    try {
      const r = await adapter.call("delete", { id });
      cleanup.push(r.status === 200 && r.data?.deleted === true);
    } catch {
      cleanup.push(false);
    }
  }
  // Outside the measured interval: verify exact original fixtures really remain.
  // A successful DELETE response alone is not proof of cleanup on both backends.
  let baselineRestored = false;
  try {
    const r = await adapter.call("workspace");
    baselineRestored =
      r.status === 200 &&
      Array.isArray(r.data?.presets) &&
      r.data.presets.length === 3 &&
      r.data.presets.every((p) => adapter.presetIds.includes(p.id));
  } catch {
    /* Unknown cleanup remains unverified. */
  }
  const summary = summarize(attempts);
  return {
    run,
    kind,
    start,
    end,
    attempts,
    ...summary,
    maxLatencyMs: attempts.length
      ? Math.max(...attempts.map((a) => a.latencyMs))
      : null,
    cpuMs: null,
    cpuEvidence: "Requires platform traces; handler wall time is not CPU",
    providerThrottles: null,
    throttleEvidence:
      "Unknown unless independently correlated with provider metadata",
    concurrency: 1,
    stoppedOnFailure: !!error,
    cleanupVerified: cleanup.every(Boolean) && baselineRestored,
    eligible:
      !error &&
      summary.failures === 0 &&
      summary.requests === (kind === "reads" ? 40 : 12) &&
      cleanup.every(Boolean) &&
      baselineRestored,
  };
}
