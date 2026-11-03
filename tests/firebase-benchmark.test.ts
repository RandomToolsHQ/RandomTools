import { it, expect } from "vitest";
import { summarize, cpuEligible } from "../scripts/firebase-poc-evidence.mjs";
const start = "2026-11-03T09:00:00Z",
  end = "2026-11-03T09:01:00Z";
it("never counts denied, redirected or wrong-owner responses as authenticated performance", () => {
  const attempts = [
    { status: 200, authorized: true, latencyMs: 75 },
    { status: 401, authorized: false, latencyMs: 1 },
    { status: 200, authorized: false, latencyMs: 2 },
    { status: 303, authorized: false, latencyMs: 3 },
    {
      status: 503,
      authorized: false,
      latencyMs: 4,
      errorKind: "provider-rate-limit",
    },
    { status: 500, authorized: false, latencyMs: 5, errorKind: "cpu-limit" },
  ];
  expect(summarize(attempts)).toMatchObject({
    successes: 1,
    failures: 5,
    latencyP50ms: 75,
    latencyP95ms: 75,
    latencyP99ms: 75,
    cpuLimitErrors: 1,
    providerThrottles: 1,
  });
  expect(cpuEligible({ start, end, requests: 6, attempts })).toBe(false);
});
it("rejects empty, incomplete and invalid measurement evidence", () => {
  expect(summarize([]).latencyP99ms).toBeNull();
  expect(cpuEligible({ start, end, requests: 0, attempts: [] })).toBe(false);
  const attempts = [{ status: 200, authorized: true, latencyMs: 90 }];
  expect(cpuEligible({ start, end, requests: 2, attempts })).toBe(false);
  expect(cpuEligible({ start: end, end: start, requests: 1, attempts })).toBe(
    false,
  );
  expect(
    cpuEligible({
      start,
      end,
      requests: 1,
      attempts: [{ ...attempts[0], latencyMs: NaN }],
    }),
  ).toBe(false);
});
it("computes end-to-end percentiles separately from CPU analytics", () => {
  const attempts = Array.from({ length: 100 }, (_, i) => ({
    status: 200,
    authorized: true,
    latencyMs: i + 1,
  }));
  expect(summarize(attempts)).toMatchObject({
    successes: 100,
    failures: 0,
    failureRate: 0,
    latencyP50ms: 50,
    latencyP95ms: 95,
    latencyP99ms: 99,
  });
  expect(cpuEligible({ start, end, requests: 100, attempts })).toBe(true);
});
