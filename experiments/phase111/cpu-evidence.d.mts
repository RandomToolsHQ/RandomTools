export function cpuEvidence(
  sample: {
    backend: string;
    start: string;
    end: string;
    eligible: boolean;
    cleanupVerified: boolean;
    failures: number;
    requests: number;
    attempts: Array<{ authorized: boolean; status: number }>;
  },
  trace: {
    script: string;
    events: Array<{
      timestamp: number;
      path: string;
      status: number;
      outcome: string;
      version: string;
      cpuMs: number;
      truncated: boolean;
    }>;
  },
  expectedVersion: string,
):
  | { withheld: true; expectedRequests: number; observedEvents: number }
  | {
      withheld: false;
      unit: string;
      source: string;
      n: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
      over10ms: number;
      version: string;
    };
