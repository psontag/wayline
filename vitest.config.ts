import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{packages,apps}/*/src/**/*.test.{ts,tsx}", "scripts/*.test.ts"],
    // A full trip search takes seconds, more on a slow CI machine.
    testTimeout: 60_000,
  },
});
