/**
 * Crea (o actualiza) el usuario de prueba con DEMO_USER / DEMO_PASSWORD del entorno.
 * Uso: npm run db:seed
 */
import bcrypt from "bcryptjs";
import { getDb } from "../src/db";
import { users } from "../src/db/schema";

async function main() {
  const username = (process.env.DEMO_USER ?? "demo").trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("Define DEMO_PASSWORD (mínimo 8 caracteres) en .env.local");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await getDb()
    .insert(users)
    .values({ username, passwordHash })
    .onConflictDoUpdate({ target: users.username, set: { passwordHash } });

  console.log(`Usuario de prueba «${username}» listo.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
