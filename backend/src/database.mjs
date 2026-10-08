import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(SOURCE_DIR, '..', 'migrations');
const DEFAULT_DATABASE_PATH = resolve(SOURCE_DIR, '..', 'data', 'library.sqlite');

export const openLibraryDatabase = (databasePath = process.env.LIBRARY_DATABASE_PATH ?? DEFAULT_DATABASE_PATH) => {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  try {
    database.pragma('foreign_keys = ON');
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = FULL');
    database.pragma('busy_timeout = 5000');

    let currentVersion = database.pragma('user_version', { simple: true });
    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{3}-.*\.sql$/.test(name))
      .sort();

    for (const migration of migrations) {
      const [, versionText] = migration.match(/^(\d{3})-/) ?? [];
      const version = Number(versionText);
      if (version <= currentVersion) continue;
      if (version !== currentVersion + 1) {
        throw new Error(`Database migration sequence gap before ${migration}.`);
      }

      const sql = readFileSync(resolve(MIGRATIONS_DIR, migration), 'utf8');
      database.transaction(() => {
        database.exec(sql);
        database.pragma(`user_version = ${version}`);
      }).immediate();
      currentVersion = version;
    }

    const latestMigrationVersion = migrations.length
      ? Number(migrations.at(-1).slice(0, 3))
      : 0;
    if (currentVersion > latestMigrationVersion) {
      throw new Error(`Database version ${currentVersion} is newer than the available migrations.`);
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
};
