import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["packages/planner/report/*.report.ts"] },
});
