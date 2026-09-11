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
    // Feature 003 Phase 8/9: many `tests/auth/*` files now sign in against the SAME small set of
    // live fixture accounts. Running test FILES in parallel (Vitest's default) fires enough
    // concurrent `signInWithPassword` calls to trip Supabase Auth's own rate limiter, which then
    // surfaces indistinguishably as "invalid credentials" (the app's own generic mapping for any
    // sign-in provider error) rather than a real credential failure. Sequential file execution
    // keeps live-fixture auth load bounded without weakening any assertion.
    fileParallelism: false,
    // Several live fixture tests resolve identity multiple times or shell out to the privileged
    // seed script (a real subprocess + DB round trip); the 5s default is tuned for unit tests, not
    // this suite's live-integration files. A longer default gives them real headroom without
    // masking an actually-hanging test — it still fails, just after a realistic ceiling.
    testTimeout: 20_000,
  },
});
