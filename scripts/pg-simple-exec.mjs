#!/usr/bin/env node
/** Simple-query PostgreSQL runner. Credentials are environment-only, never argv.
 * Usage: node scripts/pg-simple-exec.mjs <sql-file>
 * SQL errors exit 1; transport/protocol/auth failures exit 2. TLS is verified.
 */
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { assertF018ReadOnlyCaptureSql } from './f018-readonly-sql.mjs';
export { assertF018ReadOnlyCaptureSql };

const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const packet = (type, body) => Buffer.concat([Buffer.from(type), i32(body.length + 4), body]);
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
export function errorFields(body) {
  const fields = {};
  for (let pos = 0; pos < body.length && body[pos];) {
    const key = String.fromCharCode(body[pos++]);
    const end = body.indexOf(0, pos);
    if (end < 0) throw new Error('Malformed PostgreSQL error record');
    fields[key] = body.subarray(pos, end).toString('utf8'); pos = end + 1;
  }
  return fields;
}
export function redact(value, password = '') {
  let text = String(value);
  if (password) for (const secret of [password, encodeURIComponent(password)]) text = text.split(secret).join('[redacted]');
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]')
    .replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-token]')
    .replace(/[\r\n]/g, ' ');
}
export function scramFinal(password, first, bare, nonce) {
  const parts = Object.fromEntries(first.split(',').map(p => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
  const iterations = Number(parts.i);
  if (!parts.r?.startsWith(nonce) || parts.r.length <= nonce.length || !/^[A-Za-z0-9+/]+=*$/.test(parts.s ?? '') ||
      !Number.isInteger(iterations) || iterations < 4096 || iterations > 1000000 || parts.m) throw new Error('Invalid SCRAM server challenge');
  const salted = crypto.pbkdf2Sync(password, Buffer.from(parts.s, 'base64'), iterations, 32, 'sha256');
  const final = `c=biws,r=${parts.r}`;
  const auth = `${bare},${first},${final}`;
  const clientKey = hmac(salted, 'Client Key');
  const signature = hmac(crypto.createHash('sha256').update(clientKey).digest(), auth);
  const proof = Buffer.from(clientKey.map((b, i) => b ^ signature[i]));
  return { payload: `${final},p=${proof.toString('base64')}`, signature: hmac(hmac(salted, 'Server Key'), auth) };
}

export async function execute(sql, env = process.env) {
  const { PGHOST: host, PGUSER: user, SUPABASE_DB_PASSWORD: password } = env;
  if (!host || !user || !password) throw new Error('PGHOST, PGUSER and SUPABASE_DB_PASSWORD are required');
  const isF016Requested = env.F016_REMOTE_LIVE_DB_APPROVED === '1';
  const isF018Capture = env.F018_REMOTE_READONLY_CAPTURE_APPROVED === '1';
  if (isF018Capture && (isF016Requested || env.F013_LIVE === '1' || env.F015_REMOTE_LIVE_DB_APPROVED === '1')) {
    throw new Error('F018 read-only capture refuses to combine with another remote approval');
  }
  if (isF018Capture) assertF018ReadOnlyCaptureSql(sql);
  const isF016Approved = isF016Requested || isF018Capture;
  const isF016Timeout = Number(env.F016_SQL_TIMEOUT_MS ?? env.F018_SQL_TIMEOUT_MS ?? '30000');
  if (isF016Approved && (!Number.isInteger(isF016Timeout) || isF016Timeout <= 0 || isF016Timeout > 30000)) {
    throw new Error('F016_SQL_TIMEOUT_MS must be a positive integer no greater than 30000');
  }
  const isF015Approved = env.F013_LIVE === '1' && env.F015_REMOTE_LIVE_DB_APPROVED === '1';
  if ((!isF016Approved && !isF015Approved) ||
      user !== 'postgres.mxejnutukgxyccnohglo' || !/^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) || env.PGPORT !== '5432') {
    throw new Error('Direct PostgreSQL execution requires an approved session-pooler target (F016_REMOTE_LIVE_DB_APPROVED=1, F018_REMOTE_READONLY_CAPTURE_APPROVED=1 or F013_LIVE=1/F015_REMOTE_LIVE_DB_APPROVED=1)');
  }
  return await new Promise((resolve) => {
    let socket; let done = false; let phase = 'auth'; let hadSqlError = false;
    let buffer = Buffer.alloc(0); let bare; let nonce; let expectedSignature;
    let scramVerified = false; let usingScram = false;
    const raw = net.connect({ host, port: 5432 });
    const finish = (code) => { if (done) return; done = true; clearTimeout(timer); socket?.destroy(); raw.destroy(); resolve(code); };
    const fail = (message) => { process.stderr.write(`FATAL: ${redact(message, password)}\n`); finish(2); };
    const timer = setTimeout(() => fail('Direct PostgreSQL execution timed out'), 180000);
    raw.on('error', e => fail(`Connection failed (${e.code ?? 'transport'})`));
    raw.on('close', () => { if (!socket && !done) fail('Connection closed before TLS'); });
    raw.once('connect', () => raw.write(Buffer.concat([i32(8), i32(80877103)])));
    raw.once('data', reply => {
      if (reply.length !== 1 || reply[0] !== 83) return fail('Server refused TLS');
      socket = tls.connect({ socket: raw, servername: host, rejectUnauthorized: true }, () => {
        // Request the timeout at startup; also issue SET before SQL because poolers can
        // override startup options. The explicit session limit bounds F016 migration statements.
        const timeoutOption = isF016Approved ? `options\0-c statement_timeout=${isF016Timeout}\0` : '';
        const params = Buffer.from(`user\0${user}\0database\0postgres\0application_name\0pg-simple-exec\0${timeoutOption}client_encoding\0UTF8\0\0`);
        socket.write(Buffer.concat([i32(params.length + 8), i32(196608), params]));
      });
      socket.on('error', e => fail(`TLS/connection failed (${e.code ?? 'transport'})`));
      socket.on('close', () => { if (!done) fail('Connection closed before ReadyForQuery'); });
      socket.on('data', chunk => {
        try {
          buffer = Buffer.concat([buffer, chunk]);
          while (!done && buffer.length >= 5) {
            const length = buffer.readInt32BE(1);
            if (length < 4 || length > 64 * 1024 * 1024) throw new Error('Invalid PostgreSQL frame');
            if (buffer.length < length + 1) break;
            const type = String.fromCharCode(buffer[0]); const body = buffer.subarray(5, length + 1);
            buffer = buffer.subarray(length + 1);
            if (type === 'E' || type === 'N') {
              const fields = errorFields(body);
              const severity = fields.V ?? fields.S ?? (type === 'E' ? 'ERROR' : 'NOTICE');
              const message = redact(fields.M ?? 'Database error', password);
              if (type === 'E') {
                if (phase === 'auth' || severity === 'FATAL' || severity === 'PANIC') return fail(message);
                hadSqlError = true;
                process.stderr.write(`ERROR: ${fields.C ?? 'XXXXX'}: ${message}\n`);
              } else process.stdout.write(`NOTICE: ${message}\n`);
            } else if (type === 'R') {
              const auth = body.readInt32BE(0);
              if (auth === 0) {
                if (usingScram && !scramVerified) throw new Error('SCRAM authentication was not verified');
              } else if (auth === 10) {
                if (!body.subarray(4).toString().split('\0').includes('SCRAM-SHA-256')) throw new Error('Unsupported SASL mechanism');
                usingScram = true; nonce = crypto.randomBytes(24).toString('base64');
                bare = `n=,r=${nonce}`;
                const first = Buffer.from(`n,,${bare}`);
                socket.write(packet('p', Buffer.concat([Buffer.from('SCRAM-SHA-256\0'), i32(first.length), first])));
              } else if (auth === 11) {
                const final = scramFinal(password, body.subarray(4).toString(), bare, nonce);
                expectedSignature = final.signature; socket.write(packet('p', Buffer.from(final.payload)));
              } else if (auth === 12) {
                const final = body.subarray(4).toString();
                const actual = Buffer.from(final.startsWith('v=') ? final.slice(2) : '', 'base64');
                if (!expectedSignature || actual.length !== expectedSignature.length || !crypto.timingSafeEqual(actual, expectedSignature)) throw new Error('SCRAM server signature mismatch');
                scramVerified = true;
              } else throw new Error('Unsupported PostgreSQL authentication method');
            } else if (type === 'Z') {
              if (phase === 'auth') { phase = 'query'; socket.write(packet('Q', Buffer.from(`${isF016Approved ? `set statement_timeout = ${isF016Timeout};\n` : ''}${isF018Capture ? 'set default_transaction_read_only = on;\n' : ''}${sql}\0`))); }
              else { socket.write(packet('X', Buffer.alloc(0))); finish(hadSqlError ? 1 : 0); }
            } else if (type === 'C') process.stdout.write(`${body.subarray(0, -1).toString()}\n`);
            else if (type === 'D') {
              const values = []; let pos = 2;
              for (let i = 0; i < body.readInt16BE(0); i++) {
                const length = body.readInt32BE(pos); pos += 4;
                if (length === -1) values.push(null);
                else { if (length < 0 || pos + length > body.length) throw new Error('Invalid DataRow'); values.push(body.subarray(pos, pos + length).toString()); pos += length; }
              }
              process.stdout.write(`${JSON.stringify(values)}\n`);
            }
          }
        } catch (e) { fail(e.message); }
      });
    });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: pg-simple-exec.mjs <sql-file>; credentials must be environment-only');
    process.exitCode = await execute(readFileSync(process.argv[2], 'utf8'));
  } catch { process.stderr.write('FATAL: Direct PostgreSQL runner configuration or input unavailable\n'); process.exitCode = 2; }
}
