import { execSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { executeOperatorRecovery } from "../../scripts/f017-operator-recovery";
import { LiveSession } from "./f016-live-session";
import { F017_RETIRED_FUNCTIONS, F017_RETIRED_SIGNATURES } from "./f017-retirement-core";

// Keep subprocesses credential-free: self-check needs only the platform PATH.
function sanitizedF013Environment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    Path: process.env.Path,
    SystemRoot: process.env.SystemRoot,
    ComSpec: process.env.ComSpec,
    PATHEXT: process.env.PATHEXT,
    NODE_ENV: "test",
    F016_REMOTE_LIVE_DB_APPROVED: "",
  };
}

describe("T011 / HIGH 3 — Real Operator Recovery Entry Point Tests", () => {
  it("starts independently in safe self-check mode without Vitest or a network connection", () => {
    const output = execSync("npx tsx scripts/f017-operator-recovery.ts --self-check", {
      encoding: "utf8",
      env: sanitizedF013Environment(),
    });
    expect(output).toContain("self-check passed");
  });

  it("rejects an invalid standalone invocation with safe usage", () => {
    expect(() => execSync("npx tsx scripts/f017-operator-recovery.ts --invalid", { encoding: "utf8", env: sanitizedF013Environment() }))
      .toThrow();
  });

  it("refuses to run unless F016_REMOTE_LIVE_DB_APPROVED=1 is explicitly set", async () => {
    const originalEnv = process.env.F016_REMOTE_LIVE_DB_APPROVED;
    try {
      delete process.env.F016_REMOTE_LIVE_DB_APPROVED;
      await expect(executeOperatorRecovery()).rejects.toThrow("Feature 016 live database execution requires F016_REMOTE_LIVE_DB_APPROVED=1");
    } finally {
      if (originalEnv !== undefined) {
        process.env.F016_REMOTE_LIVE_DB_APPROVED = originalEnv;
      }
    }
  });

  it("executes inspection, reapply, postflight, and proves final retired state with provided session", async () => {
    const originalApproved = process.env.F016_REMOTE_LIVE_DB_APPROVED;
    const originalPass = process.env.SUPABASE_DB_PASSWORD;
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    process.env.F016_REMOTE_LIVE_DB_APPROVED = "1";
    process.env.SUPABASE_DB_PASSWORD = "mock_secret_password";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mxejnutukgxyccnohglo.supabase.co";

    const executedSql: string[] = [];
    const logs: string[] = [];
    let isApplied = false;

    const mockSession: LiveSession = {
      pid: 12345,
      query: async (sql: string) => {
        executedSql.push(sql);
        if (sql.includes("jsonb_build_array")) {
          return [
            [
              JSON.stringify({
                functions: F017_RETIRED_FUNCTIONS.map((fn, i) => ({
                  name: fn,
                  sig: F017_RETIRED_SIGNATURES[i],
                  oid: 1000 + i,
                  has_public: false,
                  has_anon: false,
                  has_authenticated: !isApplied, // drifted initially
                  has_service_role: !isApplied,
                })),
              }),
            ],
          ];
        }
        // Migration or postflight execution
        isApplied = true;
        return [];
      },
      close: vi.fn(),
    };

    try {
      const result = await executeOperatorRecovery({
        customSession: mockSession,
        migrationSql: "-- FORWARD MIGRATION --",
        postflightSql: "-- POSTFLIGHT VERIFICATION --",
        logger: (msg) => logs.push(msg),
      });

      expect(result.isApplied).toBe(true);
      expect(result.status).toBe("RETIRED");
      expect(logs.some((l) => l.includes("RECOVERY COMPLETED"))).toBe(true);

      // Verify NO secrets ever leaked in logs
      for (const log of logs) {
        expect(log).not.toContain("mock_secret_password");
      }
    } finally {
      if (originalApproved !== undefined) process.env.F016_REMOTE_LIVE_DB_APPROVED = originalApproved;
      else delete process.env.F016_REMOTE_LIVE_DB_APPROVED;

      if (originalPass !== undefined) process.env.SUPABASE_DB_PASSWORD = originalPass;
      else delete process.env.SUPABASE_DB_PASSWORD;

      if (originalUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
  });
});
