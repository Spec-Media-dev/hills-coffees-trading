import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import net from "node:net";
import tls from "node:tls";
import { describe, expect, it, vi } from "vitest";
import { errorFields, redact, scramFinal, execute } from "../../scripts/pg-simple-exec.mjs";
import { sanitizedF013Environment, supabaseCli } from "../../scripts/f013-local-target";

describe("Feature 015 direct PostgreSQL runner (no database)", () => {
  it("parses one actual PostgreSQL severity, SQLSTATE and primary message", () => {
    expect(errorFields(Buffer.from("SERROR\0C P0001\0Mrollback_aborted_payment_proofs_bucket_not_empty\0\0")))
      .toMatchObject({ S: "ERROR", M: "rollback_aborted_payment_proofs_bucket_not_empty" });
  });
  it("redacts raw/URL-encoded passwords, URLs, JWTs, and multiline messages", () => {
    const password = "fake secret:/";
    const output = redact(`${password} ${encodeURIComponent(password)} postgresql://user:pw@host/db abc.def.ghi\nend`, password);
    expect(output).not.toContain(password);
    expect(output).not.toContain(encodeURIComponent(password));
    expect(output).not.toContain("abc.def.ghi");
    expect(output).not.toContain("\n");
  });
  it("validates nonce extension and iteration bounds before deriving SCRAM proof", () => {
    const nonce = "fixture-nonce";
    const challenge = `r=${nonce}-server,s=c2FsdA==,i=4096`;
    const result = scramFinal("fake-password", challenge, `n=,r=${nonce}`, nonce);
    expect(result.payload).toContain(`c=biws,r=${nonce}-server,p=`);
    expect(result.signature).toHaveLength(32);
    for (const bad of ["r=other,s=c2FsdA==,i=4096", `r=${nonce},s=c2FsdA==,i=4096`, challenge.replace("4096", "1"), challenge.replace("4096", "1000001")]) {
      expect(() => scramFinal("fake-password", bad, `n=,r=${nonce}`, nonce)).toThrow(/challenge/);
    }
  });
  it("refuses missing credentials before network activity", async () => {
    await expect(execute("select 1", { NODE_ENV: "test" })).rejects.toThrow(/required/);
  });
  it("refuses unapproved remote targets before network activity", async () => {
    await expect(execute("select 1", { NODE_ENV: "test", PGHOST: "sample.pooler.supabase.com", PGUSER: "postgres.sample", PGPORT: "5432", SUPABASE_DB_PASSWORD: "fake-password" })).rejects.toThrow(/approved/);
  });
  it("CLI configuration errors preserve stderr and a nonzero exit without credentials", () => {
    const result = spawnSync(process.execPath, [resolve("scripts/pg-simple-exec.mjs")], {
      encoding: "utf8", env: sanitizedF013Environment(), shell: false,
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^FATAL:/);
  });
  it.each(["success", "sql-error", "disconnect"] as const)("preserves protocol output and exit status for %s (mock transport)", async (outcome) => {
    const frame = (type: string, value: Buffer) => {
      const size = Buffer.alloc(4); size.writeInt32BE(value.length + 4);
      return Buffer.concat([Buffer.from(type), size, value]);
    };
    const ready = frame("Z", Buffer.from("I"));
    const raw = new EventEmitter() as EventEmitter & { write: (data: Buffer) => void; destroy: () => void };
    const socket = new EventEmitter() as typeof raw;
    raw.write = () => { queueMicrotask(() => raw.emit("data", Buffer.from("S"))); };
    raw.destroy = () => { raw.emit("close"); };
    socket.destroy = () => { socket.emit("close"); };
    socket.write = (data) => {
      if (data[0] === 0) queueMicrotask(() => socket.emit("data", Buffer.concat([frame("R", Buffer.alloc(4)), ready])));
      else if (data[0] === 81) queueMicrotask(() => {
        if (outcome === "disconnect") { socket.emit("close"); return; }
        const response = outcome === "sql-error"
          ? frame("E", Buffer.from("SERROR\0VERROR\0CP0001\0Mrollback_aborted_payment_proofs_bucket_not_empty\0\0"))
          : Buffer.concat([frame("N", Buffer.from("SNOTICE\0Mprobe ready\0\0")), frame("C", Buffer.from("SELECT 1\0"))]);
        // Exercise frame reassembly, not only single-buffer responses.
        socket.emit("data", response.subarray(0, 3));
        socket.emit("data", Buffer.concat([response.subarray(3), ready]));
      });
    };
    const connect = vi.spyOn(net, "connect").mockImplementation(() => {
      queueMicrotask(() => raw.emit("connect")); return raw as unknown as net.Socket;
    });
    const secure = vi.spyOn(tls, "connect").mockImplementation((...args: unknown[]) => {
      queueMicrotask(() => { const callback = args.at(-1); if (typeof callback === "function") callback(); });
      return socket as unknown as tls.TLSSocket;
    });
    let stdout = ""; let stderr = "";
    const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
    const err = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { stderr += String(chunk); return true; });
    try {
      const status = await execute("select 1;", {
        NODE_ENV: "test", F013_LIVE: "1", F015_REMOTE_LIVE_DB_APPROVED: "1",
        PGHOST: "aws-0-eu-west-2.pooler.supabase.com", PGPORT: "5432",
        PGUSER: "postgres.mxejnutukgxyccnohglo", SUPABASE_DB_PASSWORD: "fake-password",
      });
      expect(status).toBe(outcome === "success" ? 0 : outcome === "sql-error" ? 1 : 2);
      if (outcome === "success") { expect(stdout).toContain("NOTICE: probe ready"); expect(stdout).toContain("SELECT 1"); expect(stderr).toBe(""); }
      if (outcome === "sql-error") expect(stderr).toBe("ERROR: P0001: rollback_aborted_payment_proofs_bucket_not_empty\n");
      if (outcome === "disconnect") expect(stderr).toContain("FATAL: Connection closed before ReadyForQuery");
      expect(secure.mock.calls[0]?.[0]).toMatchObject({ rejectUnauthorized: true });
    } finally { connect.mockRestore(); secure.mockRestore(); out.mockRestore(); err.mockRestore(); }
  });

  it("direct builder requires password and keeps credentials out of argv", () => {
    const dir = mkdtempSync(join(tmpdir(), "f015direct"));
    try {
      const file = join(dir, "query.sql"); writeFileSync(file, "select 1;");
      const env = { F013_LIVE: "1", F015_REMOTE_LIVE_DB_APPROVED: "1" };
      expect(() => supabaseCli({ kind: "production-default" }, ["db", "query", "-f", file], env)).toThrow(/SUPABASE_DB_PASSWORD/);
      const command = supabaseCli({ kind: "production-default" }, ["db", "query", "-f", file], { ...env, SUPABASE_DB_PASSWORD: "fake-password" });
      expect(command.command).toBe(process.execPath);
      expect(command.args).toHaveLength(2);
      expect(command.args.join(" ")).not.toContain("fake-password");
      expect(command.env.SUPABASE_DB_PASSWORD).toBe("fake-password");
      expect(command.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
