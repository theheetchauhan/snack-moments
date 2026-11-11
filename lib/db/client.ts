/**
 * Database client.
 *  - DATABASE_URL set (Supabase / any Postgres) → postgres-js driver (used in production).
 *  - Otherwise → embedded PGlite (real Postgres in WASM) under ./.data, zero setup locally.
 */
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import * as schema from "./schema";

// Both drivers expose the same Postgres query-builder API; we type against one of them.
export type Db = ReturnType<typeof drizzleLite<typeof schema>>;

const g = globalThis as unknown as { __db?: Promise<Db> };

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { prepare: false, max: 5 });
    await client.unsafe(schema.BOOTSTRAP_SQL);
    return drizzlePg(client, { schema }) as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await client.exec(schema.BOOTSTRAP_SQL);
  return drizzleLite(client, { schema });
}

export function getDb(): Promise<Db> {
  if (!g.__db) {
    g.__db = create().catch((e) => {
      g.__db = undefined; // allow a retry instead of caching the failure
      throw e;
    });
  }
  return g.__db;
}

export { schema };
