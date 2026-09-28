import type { SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  APPROVED_DOCKER_PATH, APPROVED_DOCKER_SHA256, assertF013DockerInspect,
  probeF013Identity, runF013DockerPsqlStdin, runtimeF013IdentityProbe,
} from "@/scripts/f013-docker-identity";

const verifiedBindings = [
  { HostIp: "0.0.0.0", HostPort: "55422" },
  { HostIp: "::", HostPort: "55422" },
];
const valid = (bindings = verifiedBindings) => ({ Name: "/supabase_db_hills-f013-local", Config: { Labels: { "com.supabase.cli.project": "hills-f013-local" } }, State: { Running: true }, NetworkSettings: { Ports: { "5432/tcp": bindings } } });

describe("F013 Docker identity probe, fully mocked", () => {
  it("accepts only the verified Windows Docker Desktop binding pair in either order", () => {
    expect(() => assertF013DockerInspect(JSON.stringify([valid()]))).not.toThrow();
    expect(() => assertF013DockerInspect(JSON.stringify([valid([...verifiedBindings].reverse())]))).not.toThrow();
  });

  it("rejects wrong inspect names, labels, state, ports, bindings, and shapes", () => {
    const mutations = [
      { ...valid(), Name: "/other" },
      { ...valid(), Config: { Labels: { "com.supabase.cli.project": "other" } } },
      { ...valid(), State: { Running: false } },
      valid([{ HostIp: "0.0.0.0", HostPort: "55422" }]),
      valid([{ HostIp: "::", HostPort: "55422" }]),
      valid([...verifiedBindings, { HostIp: "0.0.0.0", HostPort: "55422" }]),
      valid([{ HostIp: "0.0.0.0", HostPort: "55423" }, { HostIp: "::", HostPort: "55422" }]),
      valid([{ HostIp: "127.0.0.1", HostPort: "55422" }]),
      valid([{ HostIp: "0.0.0.0", HostPort: "55422" }, { HostIp: "0.0.0.0", HostPort: "55422" }]),
    ];
    for (const container of mutations) expect(() => assertF013DockerInspect(JSON.stringify([container]))).toThrow();
    for (const output of ["oops", "{}", "[]", JSON.stringify([valid(), valid()])]) expect(() => assertF013DockerInspect(output)).toThrow();
  });

  it("fails closed without a pin, and otherwise issues only fixed inspect and exec arguments", () => {
    const directory = mkdtempSync(join(tmpdir(), "f013-docker-mock-"));
    try {
      const path = join(directory, "docker.exe");
      writeFileSync(path, "mock executable bytes");
      const pin = "a".repeat(64);
      const calls: readonly string[][] = [];
      const recorded: string[][] = calls as string[][];
      const environment: NodeJS.ProcessEnv = { NODE_ENV: "test" };
      const runCommand = (_path: string, args: readonly string[], child: NodeJS.ProcessEnv) => {
        expect(_path).toBe(path);
        expect(child).toBe(environment);
        recorded.push([...args]);
        return args[0] === "inspect" ? JSON.stringify([valid()]) : "abc\n";
      };
      const deps = { hashExecutable: () => pin, runCommand, approvedPath: path };
      expect(() => probeF013Identity("nonce", path, null, environment, deps)).toThrow(/No approved/);
      expect(recorded).toHaveLength(0);
      expect(() => probeF013Identity("nonce", path, "b".repeat(64), environment, deps)).toThrow(/hash mismatch/);
      expect(recorded).toHaveLength(0);
      expect(probeF013Identity("nonce", path, pin, environment, deps)).toBe("abc");
      expect(recorded[0]).toEqual(["inspect", "supabase_db_hills-f013-local"]);
      expect(recorded[1]).toEqual(["exec", "supabase_db_hills-f013-local", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-F", "|", "-U", "postgres", "-d", "postgres", "-c", "select nonce from f013_local.identity"]);
      expect(probeF013Identity("absence", path, pin, environment, deps)).toBe("abc");
      expect(recorded.at(-1)?.at(-1)).toContain("to_regnamespace('f013_local')");
      expect(() => probeF013Identity("nonce", "docker.exe", pin, environment, deps)).toThrow(/absolute/);
      const blocked: string[][] = [];
      expect(() => probeF013Identity("nonce", path, pin, environment, {
        hashExecutable: () => pin,
        approvedPath: path,
        runCommand: (_path, args) => { blocked.push([...args]); return JSON.stringify([{ ...valid(), Name: "/other" }]); },
      })).toThrow(/fixed running/);
      expect(blocked).toEqual([["inspect", "supabase_db_hills-f013-local"]]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

describe("F013 pinned docker.exe verification", () => {
  const environment: NodeJS.ProcessEnv = { NODE_ENV: "test" };

  it("proves exact path + exact hash -> accepted", () => {
    const recorded: string[][] = [];
    const deps = {
      hashExecutable: (p: string) => {
        expect(p).toBe(APPROVED_DOCKER_PATH);
        return APPROVED_DOCKER_SHA256;
      },
      lstat: (p: string) => {
        expect(p).toBe(APPROVED_DOCKER_PATH);
        return { isFile: () => true };
      },
      runCommand: (_path: string, args: readonly string[], child: NodeJS.ProcessEnv) => {
        expect(_path).toBe(APPROVED_DOCKER_PATH);
        expect(child).toBe(environment);
        recorded.push([...args]);
        return args[0] === "inspect" ? JSON.stringify([valid()]) : "verified-result\n";
      },
    };

    expect(probeF013Identity("nonce", APPROVED_DOCKER_PATH, APPROVED_DOCKER_SHA256, environment, deps)).toBe("verified-result");
    expect(recorded[0]).toEqual(["inspect", "supabase_db_hills-f013-local"]);
    expect(recorded[1]).toEqual(["exec", "supabase_db_hills-f013-local", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-F", "|", "-U", "postgres", "-d", "postgres", "-c", "select nonce from f013_local.identity"]);

    expect(runtimeF013IdentityProbe("nonce", APPROVED_DOCKER_PATH, environment, deps)).toBe("verified-result");
    expect(runtimeF013IdentityProbe("absence", APPROVED_DOCKER_PATH, environment, deps)).toBe("verified-result");
  });

  it("proves wrong hash -> refused", () => {
    const calls: string[][] = [];
    const deps = {
      hashExecutable: () => "0".repeat(64),
      lstat: () => ({ isFile: () => true }),
      runCommand: (_path: string, args: readonly string[]) => {
        calls.push([...args]);
        return "abc\n";
      },
    };

    expect(() => probeF013Identity("nonce", APPROVED_DOCKER_PATH, "b".repeat(64), environment, deps)).toThrow(/hash mismatch/);
    expect(calls).toHaveLength(0);

    expect(() => runtimeF013IdentityProbe("nonce", APPROVED_DOCKER_PATH, environment, deps)).toThrow(/hash mismatch/);
    expect(calls).toHaveLength(0);
  });

  it("proves wrong path -> refused", () => {
    const calls: string[][] = [];
    const deps = {
      hashExecutable: () => APPROVED_DOCKER_SHA256,
      lstat: () => ({ isFile: () => true }),
      runCommand: (_path: string, args: readonly string[]) => {
        calls.push([...args]);
        return "abc\n";
      },
    };

    // Executable path differs
    expect(() => probeF013Identity("nonce", "C:\\Program Files\\Other\\docker.exe", APPROVED_DOCKER_SHA256, environment, deps)).toThrow(/path mismatch/);
    expect(() => runtimeF013IdentityProbe("nonce", "C:\\Program Files\\Other\\docker.exe", environment, deps)).toThrow(/path mismatch/);

    // Another executable is supplied
    expect(() => probeF013Identity("nonce", "C:\\Program Files\\Docker\\Docker\\resources\\bin\\cmd.exe", APPROVED_DOCKER_SHA256, environment, deps)).toThrow(/docker\.exe/);
    expect(() => runtimeF013IdentityProbe("nonce", "C:\\Program Files\\Docker\\Docker\\resources\\bin\\cmd.exe", environment, deps)).toThrow(/docker\.exe/);

    // Relative path
    expect(() => probeF013Identity("nonce", "docker.exe", APPROVED_DOCKER_SHA256, environment, deps)).toThrow(/absolute/);
    expect(() => runtimeF013IdentityProbe("nonce", "docker.exe", environment, deps)).toThrow(/absolute/);
    expect(calls).toHaveLength(0);
  });

  it("proves missing executable -> refused", () => {
    const calls: string[][] = [];
    const deps = {
      hashExecutable: () => APPROVED_DOCKER_SHA256,
      runCommand: (_path: string, args: readonly string[]) => {
        calls.push([...args]);
        return "abc\n";
      },
    };

    // Missing executable parameter
    expect(() => probeF013Identity("nonce", undefined, APPROVED_DOCKER_SHA256, environment, deps)).toThrow(/absolute approved docker\.exe path is required/);
    expect(() => runtimeF013IdentityProbe("nonce", undefined, environment, deps)).toThrow(/absolute approved docker\.exe path is required/);

    // Empty executable path
    expect(() => probeF013Identity("nonce", "", APPROVED_DOCKER_SHA256, environment, deps)).toThrow(/absolute approved docker\.exe path is required/);
    expect(() => runtimeF013IdentityProbe("nonce", "", environment, deps)).toThrow(/absolute approved docker\.exe path is required/);

    // Executable missing on disk
    expect(() => probeF013Identity("nonce", APPROVED_DOCKER_PATH, APPROVED_DOCKER_SHA256, environment, {
      ...deps,
      lstat: () => { throw new Error("ENOENT: no such file or directory"); },
    })).toThrow(/could not be verified/);

    expect(() => runtimeF013IdentityProbe("nonce", APPROVED_DOCKER_PATH, environment, {
      ...deps,
      lstat: () => { throw new Error("ENOENT: no such file or directory"); },
    })).toThrow(/could not be verified/);

    // Not a regular file
    expect(() => probeF013Identity("nonce", APPROVED_DOCKER_PATH, APPROVED_DOCKER_SHA256, environment, {
      ...deps,
      lstat: () => ({ isFile: () => false }),
    })).toThrow(/could not be verified/);

    expect(() => runtimeF013IdentityProbe("nonce", APPROVED_DOCKER_PATH, environment, {
      ...deps,
      lstat: () => ({ isFile: () => false }),
    })).toThrow(/could not be verified/);

    expect(calls).toHaveLength(0);
  });
});

describe("F013 pinned SQL stdin transport, mocked only", () => {
  const environment: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  const sql = Buffer.from("create table public.mock_table(id integer);\ninsert into public.mock_table values (1);\n");

  it("validates the executable and container, then streams SQL bytes through fixed psql args", () => {
    const calls: string[] = [];
    const dependencies = {
      hashExecutable: () => { calls.push("hash"); return APPROVED_DOCKER_SHA256; },
      lstat: () => ({ isFile: () => true }),
      runCommand: (_path: string, args: readonly string[], child: NodeJS.ProcessEnv) => {
        expect(_path).toBe(APPROVED_DOCKER_PATH);
        expect(args).toEqual(["inspect", "supabase_db_hills-f013-local"]);
        expect(child).toBe(environment);
        calls.push("inspect");
        return JSON.stringify([valid()]);
      },
      runPsql: (_path: string, args: readonly string[], options: SpawnSyncOptionsWithStringEncoding) => {
        expect(_path).toBe(APPROVED_DOCKER_PATH);
        expect(args).toEqual(["exec", "-i", "supabase_db_hills-f013-local", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"]);
        expect(args.join(" ")).not.toContain("schema.sql");
        expect(options.input).toBe(sql);
        expect(options.env).toBe(environment);
        expect(options.shell).toBe(false);
        calls.push("stdin");
        return { status: 0, stdout: "CREATE TABLE\nINSERT 0 1\n", stderr: "" };
      },
    };
    expect(runF013DockerPsqlStdin(sql, APPROVED_DOCKER_PATH, environment, dependencies)).toEqual({ stdout: "CREATE TABLE\nINSERT 0 1\n", stderr: "" });
    expect(calls).toEqual(["hash", "inspect", "stdin"]);
  });

  it("refuses inspect mismatch and non-zero psql exit", () => {
    let psqlCalled = false;
    const base = { hashExecutable: () => APPROVED_DOCKER_SHA256, lstat: () => ({ isFile: () => true }) };
    expect(() => runF013DockerPsqlStdin(sql, APPROVED_DOCKER_PATH, environment, {
      ...base, runCommand: () => JSON.stringify([{ ...valid(), State: { Running: false } }]),
      runPsql: () => { psqlCalled = true; return { status: 0, stdout: "", stderr: "" }; },
    })).toThrow(/fixed running/);
    expect(psqlCalled).toBe(false);
    expect(() => runF013DockerPsqlStdin(sql, APPROVED_DOCKER_PATH, environment, {
      ...base, runCommand: () => JSON.stringify([valid()]),
      runPsql: () => ({ status: 3, stdout: "", stderr: "ERROR: mocked failure" }),
    })).toThrow(/exit 3.*mocked failure/);
  });
});
