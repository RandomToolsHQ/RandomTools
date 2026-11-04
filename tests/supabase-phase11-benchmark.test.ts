import { it, expect } from "vitest";
import { runSample } from "../experiments/supabase/benchmark.mjs";
it("rejected authentication is never an eligible performance result", async () => {
  const s = await runSample(
    {
      userId: "member",
      presetIds: ["1", "2", "3"],
      call: async () => ({ status: 401 }),
    },
    { run: 1, kind: "reads", runId: "synthetic", sleep: async () => {} },
  );
  expect(s.eligible).toBe(false);
  expect(s.successes).toBe(0);
  expect(s.failures).toBe(1);
  expect(s.cpuMs).toBeNull();
});
it("HTTP 200 for another owner is rejected", async () => {
  const s = await runSample(
    {
      userId: "member",
      presetIds: ["1", "2", "3"],
      call: async () => ({
        status: 200,
        data: { user: { id: "other" }, pro: true },
      }),
    },
    { run: 1, kind: "reads", runId: "synthetic", sleep: async () => {} },
  );
  expect(s.eligible).toBe(false);
  expect(s.successes).toBe(0);
});
it("all successful reads require owned Pro and populated results", async () => {
  const s = await runSample(
    {
      userId: "member",
      presetIds: ["1", "2", "3"],
      call: async (op: string) => ({
        status: 200,
        data:
          op === "me"
            ? { user: { id: "member" }, pro: true }
            : { presets: [{ id: "1" }, { id: "2" }, { id: "3" }] },
      }),
    },
    { run: 1, kind: "reads", runId: "synthetic", sleep: async () => {} },
  );
  expect(s.eligible).toBe(true);
  expect(s.requests).toBe(40);
  expect(s.providerThrottles).toBeNull();
});
it("failed mixed workload cleans only exact newly returned fixture IDs", async () => {
  const deleted: string[] = [];
  const s = await runSample(
    {
      userId: "member",
      presetIds: ["1", "2", "3"],
      call: async (op: string, body: { id: string }) =>
        op === "save"
          ? { status: 200, data: { id: "created-here" } }
          : op === "delete"
            ? (deleted.push(body.id), { status: 200, data: { deleted: true } })
            : { status: 503 },
    },
    { run: 1, kind: "mixed", runId: "synthetic", sleep: async () => {} },
  );
  expect(s.eligible).toBe(false);
  expect(s.cleanupVerified).toBe(true);
  expect(deleted).toEqual(["created-here"]);
});
