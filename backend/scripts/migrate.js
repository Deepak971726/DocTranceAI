import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, pool } from "../src/db.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(currentDirectory, "../migrations");
const migrations = [
  {
    id: "001_initial_schema",
    file: "001_initial_schema.sql",
    baselineExistingSchema: true,
  },
  { id: "002_remove_document_limit", file: "002_remove_document_limit.sql" },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS node_schema_migrations (
        id varchar(255) PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const migration of migrations) {
      const applied = await client.query(
        "SELECT 1 FROM node_schema_migrations WHERE id = $1",
        [migration.id],
      );
      if (applied.rowCount > 0) {
        continue;
      }

      await client.query("BEGIN");
      try {
        let baseline = false;
        if (migration.baselineExistingSchema) {
          const existing = await client.query(
            `
              SELECT
                to_regclass('public.users') IS NOT NULL
                AND to_regclass('public.documents') IS NOT NULL
                AND to_regclass('public.messages') IS NOT NULL
                AND to_regclass('public.subscriptions') IS NOT NULL
                AND to_regprocedure('private.get_user_for_auth(text)') IS NOT NULL
                AND to_regprocedure(
                  'private.claim_document(uuid,integer,integer)'
                ) IS NOT NULL AS complete
            `,
          );
          baseline = existing.rows[0].complete;
        }
        if (!baseline) {
          const sql = await fs.readFile(path.join(migrationDirectory, migration.file), "utf8");
          await client.query(sql);
        }
        await client.query("INSERT INTO node_schema_migrations (id) VALUES ($1)", [
          migration.id,
        ]);
        await client.query("COMMIT");
        console.log(`${baseline ? "Baselined" : "Applied"} ${migration.id}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await closeDatabase();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
