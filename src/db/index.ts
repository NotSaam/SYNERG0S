import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (ver .env.example)");
  return drizzle(neon(url), { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

/** Inicialización perezosa: `next build` no necesita la BD. */
export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export { schema };
