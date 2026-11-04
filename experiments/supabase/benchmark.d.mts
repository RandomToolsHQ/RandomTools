export type Adapter = {
  userId: string;
  presetIds: string[];
  call(
    operation: string,
    body?: any,
  ): Promise<{ status: number; data?: any; errorKind?: string }>;
};
export function pause(ms: number): Promise<void>;
export function runSample(
  adapter: Adapter,
  options: {
    run: number;
    kind: "reads" | "mixed";
    runId: string;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<any>;
