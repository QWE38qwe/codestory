import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { isAbsolute, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { config as loadEnv } from "dotenv";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(scriptDir, "..");
const repositoryRoot = resolve(serverRoot, "../..");
const schemaDir = resolve(serverRoot, "prisma");
const migrationsDir = resolve(schemaDir, "migrations");

loadEnv({ path: resolve(repositoryRoot, ".env") });

function resolveDatabasePath(databaseUrl) {
  if (!databaseUrl?.startsWith("file:")) {
    throw new Error("DATABASE_URL must use Prisma's file: SQLite format.");
  }
  if (databaseUrl.startsWith("file://")) return fileURLToPath(databaseUrl);
  const value = decodeURIComponent(databaseUrl.slice("file:".length).split("?", 1)[0]);
  if (!value) throw new Error("DATABASE_URL does not contain a SQLite file path.");
  return isAbsolute(value) ? value : resolve(schemaDir, value);
}

const databasePath = resolveDatabasePath(process.env.DATABASE_URL);
await mkdir(dirname(databasePath), { recursive: true });

function expectedSchema(sql) {
  const tables = new Map();
  for (const match of sql.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)) {
    const columns = [...match[2].matchAll(/^\s+"([^"]+)"\s+/gm)].map((column) => column[1]);
    tables.set(match[1], columns);
  }
  const indexes = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map((match) => match[1]);
  return { tables, indexes };
}

function matchesExistingSchema(database, sql) {
  const expected = expectedSchema(sql);
  const actualTables = database.prepare(`
    SELECT "name" FROM "sqlite_master"
    WHERE "type" = 'table' AND "name" NOT LIKE 'sqlite_%' AND "name" != '_prisma_migrations'
    ORDER BY "name"
  `).all().map((row) => row.name);
  const expectedTables = [...expected.tables.keys()].sort();
  if (actualTables.length !== expectedTables.length || actualTables.some((name, index) => name !== expectedTables[index])) return false;

  for (const [table, columns] of expected.tables) {
    const escapedTable = table.replaceAll('"', '""');
    const actualColumns = database.prepare(`PRAGMA table_info("${escapedTable}")`).all().map((row) => row.name);
    if (actualColumns.length !== columns.length || actualColumns.some((name, index) => name !== columns[index])) return false;
  }

  const existingIndexes = new Set(database.prepare(`
    SELECT "name" FROM "sqlite_master" WHERE "type" = 'index'
  `).all().map((row) => row.name));
  return expected.indexes.every((name) => existingIndexes.has(name));
}

function recordMigration(database, migrationName, checksum) {
  database.prepare(`
    INSERT INTO "_prisma_migrations"
      ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
    VALUES (?, ?, current_timestamp, ?, 1)
  `).run(randomUUID(), checksum, migrationName);
}

const database = new DatabaseSync(databasePath);
try {
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" DATETIME,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    );
  `);

  const applied = new Set(
    database.prepare('SELECT "migration_name" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL').all()
      .map((row) => row.migration_name),
  );
  const entries = existsSync(migrationsDir)
    ? (await readdir(migrationsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    : [];

  if (applied.size === 0 && entries.length > 0) {
    const existingTableCount = database.prepare(`
      SELECT count(*) AS "count" FROM "sqlite_master"
      WHERE "type" = 'table' AND "name" NOT LIKE 'sqlite_%' AND "name" != '_prisma_migrations'
    `).get().count;
    if (existingTableCount > 0) {
      const initialMigration = entries[0];
      const initialSql = await readFile(resolve(migrationsDir, initialMigration, "migration.sql"), "utf8");
      if (!matchesExistingSchema(database, initialSql)) {
        throw new Error("Existing SQLite schema is not an exact match for the initial migration; refusing to baseline a partial or incompatible database.");
      }
      const checksum = createHash("sha256").update(initialSql).digest("hex");
      recordMigration(database, initialMigration, checksum);
      applied.add(initialMigration);
      process.stdout.write(`Baselined existing schema as ${initialMigration}\n`);
    }
  }

  for (const migrationName of entries) {
    if (applied.has(migrationName)) continue;
    const sql = await readFile(resolve(migrationsDir, migrationName, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec(sql);
      recordMigration(database, migrationName, checksum);
      database.exec("COMMIT;");
      process.stdout.write(`Applied migration ${migrationName}\n`);
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
  }
} finally {
  database.close();
}
