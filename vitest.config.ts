import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/controller/src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
