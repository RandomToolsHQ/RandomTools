export type Attempt = {
  status: number;
  authorized: boolean;
  latencyMs: number;
  errorKind?: string;
};
export function summarize(attempts: Attempt[]): {
  requests: number;
  successes: number;
  failures: number;
  failureRate: number | null;
  latencyP50ms: number | null;
  latencyP95ms: number | null;
  latencyP99ms: number | null;
  cpuLimitErrors: number;
  providerThrottles: number;
};
export function cpuEligible(sample: {
  requests: number;
  attempts: Attempt[];
  start: string;
  end: string;
}): boolean;
