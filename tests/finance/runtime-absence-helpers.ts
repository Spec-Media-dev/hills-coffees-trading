import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Feature 017: Shared helpers for runtime absence audits.
 * Kept separate from test files to avoid cross-import test suite re-execution.
 */

export function stripComments(source: string): string {
  // Lex only enough JavaScript/TypeScript to remove comments. Regex cannot tell
  // the // in https://esm.sh/stripe from an actual line comment.
  let output = "";
  let index = 0;
  let quote: "'" | '"' | "`" | undefined;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      output += char;
      if (char === "\\") {
        output += next ?? "";
        index += 2;
        continue;
      }
      if (char === quote) quote = undefined;
      index++;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      output += char;
      index++;
      continue;
    }
    if (char === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index++;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index++;
      index = Math.min(index + 2, source.length);
      continue;
    }
    output += char;
    index++;
  }
  return output;
}

export const RUNTIME_ROOTS = ["src", "lib", "components", "supabase/functions"];
export const RUNTIME_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];

export function isExcludedHistoricalPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.startsWith("specs/") ||
    normalized.startsWith("docs/") ||
    normalized.startsWith("supabase/migrations/") ||
    normalized.startsWith("supabase/rollback/") ||
    normalized.startsWith("supabase/maintenance/") ||
    normalized.startsWith("tests/") ||
    normalized.startsWith("scripts/")
  );
}

export function listRuntimeFiles(roots: string[] = RUNTIME_ROOTS, exts: string[] = RUNTIME_EXTENSIONS): string[] {
  const out: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (exts.some((ext) => entry.name.endsWith(ext))) {
          if (!isExcludedHistoricalPath(full)) {
            out.push(full);
          }
        }
      }
    };
    walk(root);
  }
  return out;
}

/**
 * Detects renamed or reintroduced deployable provider runtime content in source or Edge Functions.
 * Returns a list of detected violation descriptors, or an empty array if clean.
 * Does NOT reject legitimate non-provider Edge Functions.
 */
export function detectProviderRuntimeViolations(source: string, filePath: string): string[] {
  const stripped = stripComments(source);
  const violations: string[] = [];

  // Stripe SDK import patterns (NPM, Deno / esm.sh / unpkg)
  if (/from\s+["'`][^"'`]*stripe[^"'`]*["'`]/i.test(stripped)) {
    violations.push(`stripe_sdk_import in ${filePath}`);
  }

  // Provider payment element / client controls
  if (/StripePaymentCollector|loadStripe\s*\(|\.elements\s*\(/.test(stripped)) {
    violations.push(`stripe_client_control in ${filePath}`);
  }

  // Provider funding seam
  if (/\brequestFunding\b|from\s+["'].*\/lib\/finance\/funding["']/.test(stripped)) {
    violations.push(`provider_funding_seam in ${filePath}`);
  }

  // Stripe secret or publishable key env reads
  if (/(?:process\.env\.|Deno\.env\.get\(\s*["'])(?:STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)/.test(stripped)) {
    violations.push(`stripe_env_read in ${filePath}`);
  }

  // Retired RPC invocations
  const retiredRpcs = [
    "admin_review_payment",
    "record_stripe_payment_intent",
    "record_payment_transfer",
    "ingest_stripe_event",
  ];
  for (const rpc of retiredRpcs) {
    if (new RegExp(`(?:\\.rpc\\(\\s*["']${rpc}["']|\\b${rpc}\\b)`).test(stripped)) {
      violations.push(`retired_rpc_caller:${rpc} in ${filePath}`);
    }
  }

  return violations;
}
