import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/planner/bench/*.bench.ts"],
    testTimeout: 900_000,
  },
});
