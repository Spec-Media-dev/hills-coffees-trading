import { createHmac } from "node:crypto";

/**
 * Minimal RFC 6238 TOTP code generator, for T033's live MFA proof — no third-party TOTP dependency,
 * a few lines of standard HMAC-SHA1 dynamic truncation over Node's built-in `crypto`. This computes
 * a code from a TOTP secret the test itself owns for the duration of one run (issued by
 * `supabase.auth.mfa.enroll()` against a real fixture session, then unenrolled at the end) — it does
 * not touch, guess, or need any real user's secret.
 */

function base32Decode(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totpCode(base32Secret: string, stepSeconds = 30, digits = 6, at: number = Date.now()): string {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(at / 1000 / stepSeconds);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = (binary % 10 ** digits).toString().padStart(digits, "0");
  return code;
}
