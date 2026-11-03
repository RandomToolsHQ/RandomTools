// Measurement policy shared by the bounded workload and analytics reader.
// HTTP success alone is insufficient: the expected owned response must match.
export function summarize(attempts) {
  const accepted = attempts.filter(
    (a) =>
      a.status === 200 &&
      a.authorized === true &&
      Number.isFinite(a.latencyMs) &&
      a.latencyMs >= 0,
  );
  const times = accepted.map((a) => a.latencyMs).sort((a, b) => a - b);
  const percentile = (p) =>
    times.length ? times[Math.ceil(times.length * p) - 1] : null;
  return {
    requests: attempts.length,
    successes: accepted.length,
    failures: attempts.length - accepted.length,
    failureRate: attempts.length
      ? (attempts.length - accepted.length) / attempts.length
      : null,
    latencyP50ms: percentile(0.5),
    latencyP95ms: percentile(0.95),
    latencyP99ms: percentile(0.99),
    cpuLimitErrors: attempts.filter((a) => a.errorKind === "cpu-limit").length,
    providerThrottles: attempts.filter(
      (a) => a.errorKind === "provider-rate-limit",
    ).length,
  };
}
export function cpuEligible(sample) {
  if (
    !Array.isArray(sample?.attempts) ||
    sample.requests !== sample.attempts.length
  )
    return false;
  const evidence = summarize(sample.attempts);
  return (
    evidence.requests > 0 &&
    evidence.failures === 0 &&
    Number.isFinite(Date.parse(sample.start)) &&
    Number.isFinite(Date.parse(sample.end)) &&
    Date.parse(sample.start) < Date.parse(sample.end)
  );
}
