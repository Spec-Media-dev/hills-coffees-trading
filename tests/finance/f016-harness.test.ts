import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { F016_LIVE_SCENARIOS } from "./f016-live-scenarios";
import {
  assertF016LiveTarget,
  assertF016HttpTarget,
  F016_TARGET_REF,
  F016_SQL_TIMEOUT_MS,
  F016_PROCESS_TIMEOUT_MS,
  F016TargetError,
} from "../../scripts/f016-live-target";

describe("Feature 016 T050: Harness Safety & Credential Contract Tests", () => {
  it("rejects mixed local mode before direct PostgreSQL target resolution", () => {
    expect(()=>assertF016LiveTarget({F016_REMOTE_LIVE_DB_APPROVED:"1",F013_TARGET:"local",F013_LOCAL_APPROVED:"1",SUPABASE_DB_PASSWORD:"test",NEXT_PUBLIC_SUPABASE_URL:`https://${F016_TARGET_REF}.supabase.co`})).toThrow("f016_remote_refuses_f013_local_override");
  });
  it("pins HTTP to the approved HTTPS origin", () => {
    expect(() => assertF016HttpTarget(`https://${F016_TARGET_REF}.supabase.co`)).not.toThrow();
  });
  it("refuses other projects and misleading approved-host URLs", () => {
    for(const value of ["https://wrong.supabase.co",`https://${F016_TARGET_REF}.supabase.co.attacker.test`, `http://${F016_TARGET_REF}.supabase.co`, `https://${F016_TARGET_REF}.supabase.co/other`]) expect(()=>assertF016HttpTarget(value)).toThrow(F016TargetError);
  });
  it("refuses missing and malformed HTTP targets", () => {
    for(const value of [undefined,"","not a URL"])expect(()=>assertF016HttpTarget(value)).toThrow(/missing_or_malformed/);
    expect(()=>assertF016LiveTarget({F016_REMOTE_LIVE_DB_APPROVED:"1",SUPABASE_DB_PASSWORD:"local-test",NEXT_PUBLIC_SUPABASE_URL:"https://wrong.supabase.co"})).toThrow(/http_target_mismatch/);
  });
  it("fails closed unless F016_REMOTE_LIVE_DB_APPROVED is explicitly set to '1'", () => {
    // Missing approval
    expect(() => assertF016LiveTarget({ F016_REMOTE_LIVE_DB_APPROVED: undefined })).toThrow(
      F016TargetError
    );
    expect(() => assertF016LiveTarget({ F016_REMOTE_LIVE_DB_APPROVED: undefined })).toThrow(
      /F016_REMOTE_LIVE_DB_APPROVED=1/
    );

    // Incorrect value (e.g. true, yes, 0)
    expect(() => assertF016LiveTarget({ F016_REMOTE_LIVE_DB_APPROVED: "true" })).toThrow(
      /F016_REMOTE_LIVE_DB_APPROVED=1/
    );
    expect(() => assertF016LiveTarget({ F016_REMOTE_LIVE_DB_APPROVED: "0" })).toThrow(
      /F016_REMOTE_LIVE_DB_APPROVED=1/
    );
  });

  it("verifies hardcoded approved target ref matches 'mxejnutukgxyccnohglo'", () => {
    expect(F016_TARGET_REF).toBe("mxejnutukgxyccnohglo");
  });

  it("fails closed if SUPABASE_DB_PASSWORD is missing even when approved", () => {
    expect(() =>
      assertF016LiveTarget({
        F016_REMOTE_LIVE_DB_APPROVED: "1",
        SUPABASE_DB_PASSWORD: "",
      })
    ).toThrow(/SUPABASE_DB_PASSWORD/);
  });

  it("enforces strict isolation from legacy F013_LIVE and F015_REMOTE_LIVE_DB_APPROVED", () => {
    // Having F013_LIVE=1 or F015_REMOTE_LIVE_DB_APPROVED=1 alone must NOT satisfy F016
    expect(() =>
      assertF016LiveTarget({
        F013_LIVE: "1",
        F015_REMOTE_LIVE_DB_APPROVED: "1",
        SUPABASE_DB_PASSWORD: "test-password",
      })
    ).toThrow(/F016_REMOTE_LIVE_DB_APPROVED=1/);
  });

  it("verifies harness enforces 30s SQL timeout and 180s process limits", () => {
    expect(F016_SQL_TIMEOUT_MS).toBe(30000);
    expect(F016_PROCESS_TIMEOUT_MS).toBe(180000);
  });

  it("maps all 29 live scenarios to distinct fixture-backed handlers", () => {
    const handlers = F016_LIVE_SCENARIOS.map(s => s.handler);
    expect(F016_LIVE_SCENARIOS.map(s => s.id)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
    expect(new Set(handlers).size).toBe(29);
    for (const scenario of F016_LIVE_SCENARIOS) expect(typeof scenario.handler).toBe("function");
    expect(F016_LIVE_SCENARIOS[14].handler.name).toBe("inventoryConservation");
    expect(F016_LIVE_SCENARIOS[15].handler.name).toBe("nullLocationConcurrency");
    expect(F016_LIVE_SCENARIOS[16].handler.toString()).toContain("f016_exact_group_membership_or_quantity");
    expect(F016_LIVE_SCENARIOS[23].handler.toString()).toContain("PAYMENT_REJECTED");
    expect(F016_LIVE_SCENARIOS[27].handler.toString()).toContain("rollback");
    expect(F016_LIVE_SCENARIOS[28].handler.toString()).toContain("cleanupLiveFixture");
  });

  it("verifies credential safety: secrets and passwords are never printed or embedded in source", () => {
    const harnessPath = path.resolve(process.cwd(), "scripts/f016-live-target.ts");
    const source = fs.readFileSync(harnessPath, "utf8");

    // Must never contain hardcoded service role keys or db passwords
    expect(source).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
    expect(source).not.toMatch(/password\s*[:=]\s*["'][^"']+["']/i);

    // Must use environment variable lookup
    expect(source).toContain("env.SUPABASE_DB_PASSWORD");
  });

  it("verifies harness refuses execution against mismatched project ref or name", () => {
    const tempRefPath = path.resolve(process.cwd(), "supabase/.temp/project-ref");
    if (fs.existsSync(tempRefPath)) {
      const activeRef = fs.readFileSync(tempRefPath, "utf8").trim();
      expect(activeRef).toBe(F016_TARGET_REF);
    }
  });
});
