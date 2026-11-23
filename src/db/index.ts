import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

function createDb() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Falta POSTGRES_URL (o DATABASE_URL) con la conexión a Postgres: ver .env.example");
  const client = postgres(url, {
    // El pooler de Supabase en modo transacción no admite sentencias preparadas.
    prepare: false,
    // Serverless: pocas conexiones por instancia y se sueltan al quedar inactiva; del resto se ocupa el pooler.
    max: 3,
    idle_timeout: 20,
  });
  return drizzle(client, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

/** Inicialización perezosa: `next build` no necesita la BD. */
export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export { schema };
