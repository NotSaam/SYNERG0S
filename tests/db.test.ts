import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { getDb } from "../src/db";
import { events, files, runs, tasks, users } from "../src/db/schema";

test("las cinco tablas tienen RLS activada y ninguna política", () => {
  for (const table of [users, runs, tasks, events, files]) {
    const config = getTableConfig(table);
    assert.equal(config.enableRLS, true, config.name);
    assert.deepEqual(config.policies, [], config.name);
  }
});

test("sin POSTGRES_URL ni DATABASE_URL, getDb() falla nombrando las variables", () => {
  delete process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  assert.throws(() => getDb(), /POSTGRES_URL.*DATABASE_URL/);
});

test("getDb() prefiere POSTGRES_URL y crea un único cliente apto para el pooler", () => {
  // No llega a conectar: postgres.js abre la conexión con la primera consulta.
  process.env.POSTGRES_URL = "postgres://pooler.invalid/prueba";
  process.env.DATABASE_URL = "postgres://otra.invalid/prueba";
  const db = getDb();
  assert.equal(getDb(), db);
  assert.deepEqual(db.$client.options.host, ["pooler.invalid"]);
  assert.equal(db.$client.options.prepare, false);
  assert.ok(db.$client.options.max <= 5);
});
