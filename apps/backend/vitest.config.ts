import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@chatrix/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
});
