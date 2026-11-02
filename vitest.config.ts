import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Avoid oversubscribing workerd, DOM and full-strength hashing fixtures.
    maxWorkers: 2,
  },
});
