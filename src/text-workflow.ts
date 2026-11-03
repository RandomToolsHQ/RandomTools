import { z } from "zod";
import { convert } from "./engines";
const names = ["upper", "lower", "title", "slug", "trim"] as const;
export function workflowSteps(value: string): (typeof names)[number][] {
  const steps = value.split(",").map((v) => v.trim());
  if (
    steps.length < 1 ||
    steps.length > 10 ||
    steps.some((s) => !names.includes(s as (typeof names)[number]))
  )
    throw Error("Use up to 10 ordered steps: upper, lower, title, slug, trim.");
  return steps as (typeof names)[number][];
}
export function runTextWorkflow(text: string, steps: string): string {
  if (text.length > 200000)
    throw Error("Workflow input exceeds 200,000 characters.");
  return workflowSteps(steps).reduce(
    (value, step) =>
      step === "trim" ? value.trim() : convert("case", value, step, ""),
    text,
  );
}
const configuration = z.object({
  operation: z
    .enum(["case", "json", "qr", "workflow", "regex"])
    .default("case"),
  mode: z.enum(["upper", "lower", "title", "slug"]).default("upper"),
  steps: z.string().default("lower,slug"),
  regexPattern: z.string().default("(?<word>\\w+)"),
  regexFlags: z.string().default("g"),
  replacement: z.string().default("$<word>"),
});
export function workspaceConfiguration(serialized: unknown) {
  try {
    const value = configuration.parse(
      typeof serialized === "string" ? JSON.parse(serialized) : serialized,
    );
    if (value.operation === "workflow") workflowSteps(value.steps);
    return value;
  } catch {
    throw Error(
      "This saved configuration is invalid. Your existing work was preserved; review or delete the saved record.",
    );
  }
}
