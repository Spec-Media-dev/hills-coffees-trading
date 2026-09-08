import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    // Exits 0 when no test files exist yet (true for this foundation-only slice — real test
    // files land in Phase 9), while still failing normally once real tests exist and fail.
    passWithNoTests: true,
  },
});
