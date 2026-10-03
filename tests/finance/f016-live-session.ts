/** Test-only, persistent simple-query sessions. No connection is opened at import time. */
import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";
import { buildF016SanitizedEnv } from "@/scripts/f016-live-target";
import { errorFields, scramFinal } from "@/scripts/pg-simple-exec.mjs";

const int32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const packet = (type: string, body: Buffer) => Buffer.concat([Buffer.from(type), int32(body.length + 4), body]);
export class LiveDatabaseError extends Error {
  constructor(readonly domain: string, readonly sqlState: string) { super(domain); }
}
export type QueryRows = Array<Array<string | null>>;
export interface LiveSession {
  pid: number;
  query(sql: string): Promise<QueryRows>;
  close(): void;
}

/** Verified TLS and SCRAM, one in-flight query per backend, bounded connection/query lifetimes. */
export async function openLiveSession(): Promise<LiveSession> {
  const env = buildF016SanitizedEnv(); // Approval and target validation precede every socket.
  return new Promise((resolve, reject) => {
    const raw = net.connect({ host: env.PGHOST!, port: Number(env.PGPORT) });
    let socket: tls.TLSSocket | undefined;
    let buffer = Buffer.alloc(0);
    let ready = false;
    let closed = false;
    let backendPid = 0;
    let nonce = "";
    let bare = "";
    let signature: Buffer | undefined;
    let verified = false;
    let timeoutConfigured = false;
    let pending: { resolve: (rows: QueryRows) => void; reject: (e: Error) => void; rows: QueryRows; origin: Error; error?: Error } | undefined;
    let timer = setTimeout(() => fail(new Error("f016_session_connect_timeout")), 30000);
    const lifetime = setTimeout(() => fail(new Error("f016_session_lifetime_timeout")), 180000);
    const close = () => {
      closed = true; clearTimeout(timer); clearTimeout(lifetime);
      pending?.reject(new Error("f016_session_closed")); pending = undefined;
      socket?.destroy(); raw.destroy();
    };
    const fail = (error: Error) => { pending?.reject(error); pending = undefined; if (!ready) reject(error); close(); };
    const query = (sql: string): Promise<QueryRows> => {
      if (closed || pending || !socket) return Promise.reject(new Error("f016_session_not_ready"));
      return new Promise((queryResolve, queryReject) => {
        pending = { resolve: queryResolve, reject: queryReject, rows: [], origin: new Error("f016_query_origin") };
        timer = setTimeout(() => fail(new Error("f016_session_query_timeout")), 35000);
        // Session poolers may override startup options; enforce limits before the first query.
        const prefix = timeoutConfigured ? "" : "set statement_timeout=30000; set lock_timeout=10000; ";
        timeoutConfigured = true;
        socket!.write(packet("Q", Buffer.from(`${prefix}${sql}\0`)));
      });
    };
    raw.on("error", () => fail(new Error("f016_session_transport_error")));
    raw.once("connect", () => raw.write(Buffer.concat([int32(8), int32(80877103)])));
    raw.once("data", reply => {
      if (reply.length !== 1 || reply[0] !== 83) return fail(new Error("f016_session_tls_refused"));
      socket = tls.connect({ socket: raw, servername: env.PGHOST, rejectUnauthorized: true }, () => {
        const params = Buffer.from(`user\0${env.PGUSER}\0database\0postgres\0application_name\0f016-live-harness\0options\0-c statement_timeout=30000 -c lock_timeout=10000\0client_encoding\0UTF8\0\0`);
        socket!.write(Buffer.concat([int32(params.length + 8), int32(196608), params]));
      });
      socket.on("error", () => fail(new Error("f016_session_tls_error")));
      socket.on("close", () => { if (!closed) fail(new Error("f016_session_closed")); });
      socket.on("data", chunk => {
        try {
          buffer = Buffer.concat([buffer, chunk]);
          while (buffer.length >= 5) {
            const length = buffer.readInt32BE(1);
            if (length < 4 || length > 64 * 1024 * 1024) throw new Error("f016_invalid_frame");
            if (buffer.length < length + 1) break;
            const type = String.fromCharCode(buffer[0]);
            const body = buffer.subarray(5, length + 1);
            buffer = buffer.subarray(length + 1);
            if (type === "R") {
              const method = body.readInt32BE(0);
              if (method === 10) {
                if (!body.subarray(4).toString().split("\0").includes("SCRAM-SHA-256")) throw new Error("f016_scram_unavailable");
                nonce = crypto.randomBytes(24).toString("base64"); bare = `n=,r=${nonce}`;
                const first = Buffer.from(`n,,${bare}`);
                socket!.write(packet("p", Buffer.concat([Buffer.from("SCRAM-SHA-256\0"), int32(first.length), first])));
              } else if (method === 11) {
                const final = scramFinal(env.SUPABASE_DB_PASSWORD!, body.subarray(4).toString(), bare, nonce);
                signature = final.signature;
                socket!.write(packet("p", Buffer.from(final.payload)));
              } else if (method === 12) {
                const final = body.subarray(4).toString();
                const actual = Buffer.from(final.startsWith("v=") ? final.slice(2) : "", "base64");
                if (!signature || actual.length !== signature.length || !crypto.timingSafeEqual(actual, signature)) throw new Error("f016_scram_signature_error");
                verified = true;
              } else if (method !== 0 || !verified) throw new Error("f016_scram_required");
            } else if (type === "K") backendPid = body.readInt32BE(0);
            else if (type === "E") {
              const fields = errorFields(body) as Record<string, string>;
              const e = new LiveDatabaseError(fields.M ?? "database_error", fields.C ?? "XXXXX");
              if (!ready) return fail(new Error("f016_session_auth_error"));
              if (pending) { e.stack += "\n" + pending.origin.stack; pending.error = e; }
            } else if (type === "D" && pending) {
              const values: Array<string | null> = []; let pos = 2;
              for (let i = 0; i < body.readInt16BE(0); i++) {
                const size = body.readInt32BE(pos); pos += 4;
                if (size === -1) values.push(null);
                else { if (size < 0 || pos + size > body.length) throw new Error("f016_invalid_row"); values.push(body.subarray(pos, pos + size).toString()); pos += size; }
              }
              pending.rows.push(values);
            } else if (type === "Z") {
              clearTimeout(timer);
              if (!ready) {
                if (!backendPid) return fail(new Error("f016_backend_pid_missing"));
                ready = true;
                // Poolers synthesize BackendKeyData PIDs; obtain the actual pinned PostgreSQL PID.
                void query("select pg_backend_pid();").then(rows => {
                  const pid = Number(rows[0]?.[0]);
                  if (!Number.isInteger(pid) || pid <= 0) throw new Error("f016_backend_pid_missing");
                  resolve({ pid, query, close });
                }).catch(error => { reject(error); close(); });
              } else if (pending) {
                const done = pending; pending = undefined;
                if (done.error) done.reject(done.error); else done.resolve(done.rows);
              }
            }
          }
        } catch { fail(new Error("f016_session_protocol_error")); }
      });
    });
  });
}

export async function withLiveSession<T>(fn: (session: LiveSession) => Promise<T>): Promise<T> {
  const session = await openLiveSession();
  try { return await fn(session); } finally { session.close(); }
}
