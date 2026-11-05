// Correlate only complete, accepted, isolated intervals. Raw requests are never stored.
export function cpuEvidence(sample, trace, expectedVersion) {
  const start = Date.parse(sample.start),
    end = Date.parse(sample.end);
  const events = trace.events.filter(
    (e) =>
      e.timestamp >= start &&
      e.timestamp <= end &&
      ["/api/me", "/api/pro/presets"].includes(e.path),
  );
  if (
    sample.backend !== "cloudflare" ||
    !sample.eligible ||
    !sample.cleanupVerified ||
    sample.failures !== 0 ||
    !sample.attempts?.length ||
    sample.attempts.length !== sample.requests ||
    !sample.attempts.every((a) => a.authorized && a.status === 200) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    trace.script !== "randomtools-phase11-baseline-api" ||
    events.length !== sample.requests ||
    !events.every(
      (e) =>
        e.status === 200 &&
        e.outcome === "ok" &&
        e.version === expectedVersion &&
        Number.isFinite(e.cpuMs) &&
        e.cpuMs >= 0 &&
        !e.truncated,
    )
  )
    return {
      withheld: true,
      expectedRequests: sample.requests,
      observedEvents: events.length,
    };
  const values = events.map((e) => e.cpuMs).sort((a, b) => a - b);
  const q = (p) => values[Math.ceil(values.length * p) - 1];
  return {
    withheld: false,
    unit: "milliseconds",
    source: "Cloudflare realtime per-request platform CPU metadata",
    n: values.length,
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: values.at(-1),
    over10ms: values.filter((x) => x > 10).length,
    version: expectedVersion,
  };
}
