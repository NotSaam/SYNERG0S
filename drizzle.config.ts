import { defineConfig } from "drizzle-kit";

// Crear tablas pide una conexión de sesión; el pooler en modo transacción queda como alternativa.
const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: url! },
});
