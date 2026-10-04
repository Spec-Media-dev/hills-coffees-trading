/* eslint-disable @typescript-eslint/no-explicit-any -- test-only: rows returned by psql are dynamic JSON that these suites assert on structurally */
/** Helpers for the Feature 018 Admin orchestration suites against REAL local PostgreSQL (LOCAL ONLY). */
import { W } from "../commerce/f018-fixtures";
import { PsqlSession, errorLine, jsonLine, work, workScalar } from "../commerce/f018-local-pg";

export type Result<T = Record<string, any>> = { ok: true; value: T } | { ok: false; error: string; detail?: string };

export const lit = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
};

let counter = 5000;
export const req = (): string => `f018000c-0000-4000-8000-${(++counter).toString(16).padStart(12, "0")}`;

function parse<T>(output: string): Result<T> {
  const error = errorLine(output);
  if (error) {
    const detail = output.split(/\r?\n/).find((line) => /^DETAIL:/.test(line));
    return { ok: false, error: error.replace(/^ERROR:\s+/, "").trim(), detail: detail?.replace(/^DETAIL:\s+/, "").trim() };
  }
  return { ok: true, value: jsonLine<T>(output) };
}

export class Operator {
  private constructor(readonly session: PsqlSession, readonly userId: string) {}

  static async open(name: string, userId: string, aal: "aal1" | "aal2" = "aal1"): Promise<Operator> {
    const session = new PsqlSession(name);
    await session.run("\\set VERBOSITY default");
    await session.asUser(userId, aal);
    return new Operator(session, userId);
  }

  async rpc<T = Record<string, any>>(fn: string, ...args: unknown[]): Promise<Result<T>> {
    return parse<T>(await this.session.run(`select public.${fn}(${args.map(lit).join(", ")});`));
  }

  raw(sql: string): Promise<string> { return this.session.run(sql); }

  createCoffee(payload: Record<string, unknown>, requestId = req()) { return this.rpc("create_catalogue_coffee_intent", requestId, payload); }
  saveStep(coffeeId: string, step: string, revision: number, payload: Record<string, unknown>, requestId = req()) { return this.rpc("save_catalogue_step", requestId, coffeeId, step, revision, payload); }
  close(): Promise<void> { return this.session.close(); }
}

export const adminUser = W.users.admin;

export interface CoffeeView { id: string; status: string; revision: number; name: string; slug: string; description: string | null; origin_id: string | null; featured_at: string | null }

export const coffeeRow = (coffeeId: string): CoffeeView | null => {
  const text = workScalar(`select coalesce((select to_jsonb(c) - 'created_at' - 'updated_at' from public.coffees c where c.id = '${coffeeId}'), 'null'::jsonb)`);
  return JSON.parse(text) as CoffeeView | null;
};

/** Simulates a completed browser upload: the object exists in Storage so the readiness check can see it. */
export function putPublicObject(path: string): void {
  work(`insert into storage.objects (bucket_id, name) values ('public-assets', '${path}') on conflict do nothing`, "supabase_admin");
}

export const countOf = (table: string, where = "true"): number => Number(workScalar(`select count(*) from public.${table} where ${where}`));
