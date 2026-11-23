import * as fs from "fs";
import * as path from "path";
import { DatabaseSync } from "node:sqlite";

export interface MemoryRow {
  key: string;
  value: string;
}

export interface MemoryDb {
  set(key: string, value: string): void;
  get(key: string): string | undefined;
  delete(key: string): boolean;
  list(): MemoryRow[];
  clear(): number;
}

function openDb(): DatabaseSync {
  const dataDir = path.join(process.env.HOME || ".", ".ai-agent-data");
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new DatabaseSync(path.join(dataDir, "memory.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  return db;
}

export function createMemoryDb(): MemoryDb {
  const db = openDb();

  return {
    set(key, value) {
      db.prepare(
        "INSERT INTO memory (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(key, value);
    },

    get(key) {
      const row = db
        .prepare("SELECT value FROM memory WHERE key = ?")
        .get(key) as MemoryRow | undefined;
      return row?.value;
    },

    delete(key) {
      const result = db
        .prepare("DELETE FROM memory WHERE key = ?")
        .run(key) as { changes: number };
      return result.changes > 0;
    },

    list() {
      return db
        .prepare("SELECT key, value FROM memory ORDER BY key")
        .all() as unknown as MemoryRow[];
    },

    clear() {
      const result = db.prepare("DELETE FROM memory").run() as {
        changes: number;
      };
      return result.changes;
    },
  };
}
