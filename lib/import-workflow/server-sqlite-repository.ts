import { mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import type { AsyncImportSessionRepository } from "./types";
import { createPersistedImportSession, importSessionStorageKey, parsePersistedImportSession } from "./persistence";

const databaseDirectory = path.join(process.cwd(), "data");
const databasePath = path.join(databaseDirectory, "import-workflow.sqlite");

let repositoryPromise: Promise<AsyncImportSessionRepository> | null = null;

async function createDatabase() {
  await mkdir(databaseDirectory, { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS import_sessions (
      session_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      saved_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return database;
}

export async function createSqliteImportSessionRepository(): Promise<AsyncImportSessionRepository> {
  if (repositoryPromise) return repositoryPromise;

  repositoryPromise = createDatabase().then((database) => ({
    async load() {
      const row = database.prepare("SELECT payload FROM import_sessions WHERE session_key = ?").get(importSessionStorageKey) as { payload: string } | undefined;
      return row ? parsePersistedImportSession(row.payload) : null;
    },
    async save(session) {
      const persistedSession = createPersistedImportSession(session);
      database.prepare(`
        INSERT INTO import_sessions (session_key, payload, saved_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(session_key) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at
      `).run(importSessionStorageKey, JSON.stringify(persistedSession));
      return persistedSession;
    },
    async clear() {
      database.prepare("DELETE FROM import_sessions WHERE session_key = ?").run(importSessionStorageKey);
    },
  }));

  return repositoryPromise;
}

export const importWorkflowDatabasePath = databasePath;
