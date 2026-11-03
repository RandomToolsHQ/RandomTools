import { it, expect } from "vitest";
import {
  runTextWorkflow,
  workflowSteps,
  workspaceConfiguration,
} from "../src/text-workflow";
it("runs ordered transforms and preserves existing ten-step/input bounds", () => {
  expect(runTextWorkflow("  Hello WORLD!  ", "trim,lower,slug")).toBe(
    "hello-world",
  );
  expect(runTextWorkflow("Hello", "lower,upper")).toBe("HELLO");
  expect(runTextWorkflow("Hello", "upper,lower")).toBe("hello");
  expect(workflowSteps(Array(10).fill("trim").join(","))).toHaveLength(10);
  expect(() => workflowSteps(Array(11).fill("trim").join(","))).toThrow();
  expect(() => runTextWorkflow("x".repeat(200001), "trim")).toThrow();
});
it("rejects invalid steps before producing output or partially executing a workflow", () => {
  for (const steps of [
    "",
    ",",
    "trim,eval",
    "lower,__proto__",
    "lower,",
    "window.location",
  ])
    expect(() => runTextWorkflow("private input", steps)).toThrow();
});
it("loads valid saved configurations without inputs/results and defaults legacy fields safely", () => {
  expect(
    workspaceConfiguration('{"operation":"workflow","steps":"upper,trim"}'),
  ).toMatchObject({
    operation: "workflow",
    steps: "upper,trim",
    mode: "upper",
  });
  expect(workspaceConfiguration("{}").operation).toBe("case");
  expect(
    workspaceConfiguration('{"operation":"case","secretInput":"private"}'),
  ).not.toHaveProperty("secretInput");
  expect(
    workspaceConfiguration(
      '{"operation":"regex","regexFlags":"","replacement":""}',
    ),
  ).toMatchObject({ regexFlags: "", replacement: "" });
});
it("reports corrupt saved data without uncaught JSON errors, applying values or exposing contents", () => {
  for (const data of [
    "PRIVATE_CORRUPT_INPUT",
    "null",
    "[]",
    '{"operation":"eval"}',
    '{"steps":["upper"]}',
    '{"operation":"workflow","steps":"eval"}',
  ]) {
    expect(() => workspaceConfiguration(data)).toThrow(
      "saved configuration is invalid",
    );
    try {
      workspaceConfiguration(data);
    } catch (e) {
      expect((e as Error).message).not.toContain("PRIVATE_CORRUPT_INPUT");
    }
  }
});
