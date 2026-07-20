import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AsyncImportSessionRepository } from "./types";
import { createPersistedImportSession, importSessionStorageKey, parsePersistedImportSession } from "./persistence";

const execFileAsync = promisify(execFile);
const databaseDirectory = path.join(process.cwd(), "data");
const databasePath = path.join(databaseDirectory, "research-eval.duckdb");

let repositoryPromise: Promise<AsyncImportSessionRepository> | null = null;
let databaseReadyPromise: Promise<void> | null = null;

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function runDuckDbSql(sql: string) {
  await mkdir(databaseDirectory, { recursive: true });
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "research-eval-duckdb-"));
  const sqlFile = path.join(tempDirectory, "statement.sql");
  await writeFile(sqlFile, sql);

  try {
    const { stdout } = await execFileAsync("duckdb", [databasePath, "-json", "-c", `.read ${sqlFile}`], {
      maxBuffer: 1024 * 1024 * 32,
    });
    return stdout;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function ensureDatabase() {
  if (databaseReadyPromise) return databaseReadyPromise;

  databaseReadyPromise = runDuckDbSql(`
    CREATE TABLE IF NOT EXISTS import_sessions (
      session_key VARCHAR PRIMARY KEY,
      payload JSON NOT NULL,
      saved_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    );

    CREATE TABLE IF NOT EXISTS dimensions_snapshots (
      id VARCHAR PRIMARY KEY,
      year INTEGER NOT NULL,
      file_name VARCHAR NOT NULL,
      imported_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      row_count INTEGER NOT NULL,
      status VARCHAR NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS dimensions_publications (
      id VARCHAR PRIMARY KEY,
      snapshot_id VARCHAR NOT NULL,
      doi VARCHAR,
      pubmed_id VARCHAR,
      title VARCHAR,
      normalized_doi VARCHAR,
      normalized_pubmed_id VARCHAR,
      normalized_title VARCHAR,
      year INTEGER,
      raw_payload JSON NOT NULL,
      imported_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    );

    CREATE INDEX IF NOT EXISTS idx_dimensions_publications_doi ON dimensions_publications(normalized_doi);
    CREATE INDEX IF NOT EXISTS idx_dimensions_publications_pubmed ON dimensions_publications(normalized_pubmed_id);
    CREATE INDEX IF NOT EXISTS idx_dimensions_publications_title ON dimensions_publications(normalized_title);
    CREATE INDEX IF NOT EXISTS idx_dimensions_publications_snapshot ON dimensions_publications(snapshot_id);
  `).then(() => undefined);

  return databaseReadyPromise;
}

export function buildDimensionsSnapshotImportSql(options: { csvPath: string; snapshotId: string; year: number; fileName: string }) {
  const csvPath = sqlString(options.csvPath);
  const snapshotId = sqlString(options.snapshotId);
  const fileName = sqlString(options.fileName);

  return `
    CREATE OR REPLACE TEMP TABLE imported_dimensions AS
      SELECT * FROM read_csv_auto(${csvPath}, header = true, ignore_errors = true);

    DELETE FROM dimensions_publications WHERE snapshot_id = ${snapshotId};
    DELETE FROM dimensions_snapshots WHERE id = ${snapshotId};

    INSERT INTO dimensions_snapshots (id, year, file_name, row_count, status)
      SELECT ${snapshotId}, ${options.year}, ${fileName}, count(*), 'active'
      FROM imported_dimensions;

    INSERT INTO dimensions_publications (
      id,
      snapshot_id,
      doi,
      pubmed_id,
      title,
      normalized_doi,
      normalized_pubmed_id,
      normalized_title,
      year,
      raw_payload
    )
    SELECT
      id,
      ${snapshotId} AS snapshot_id,
      doi,
      pubmed_id,
      title,
      lower(regexp_replace(regexp_replace(coalesce(doi, ''), '^https?://(dx\\.)?doi\\.org/', ''), '^doi:', '')) AS normalized_doi,
      regexp_replace(coalesce(pubmed_id, ''), '[^0-9]', '', 'g') AS normalized_pubmed_id,
      lower(regexp_replace(coalesce(title, ''), '[^[:alnum:] ]', ' ', 'g')) AS normalized_title,
      try_cast(year AS INTEGER) AS year,
      to_json(imported_dimensions) AS raw_payload
    FROM imported_dimensions
    WHERE id IS NOT NULL;
  `;
}

export async function importDimensionsSnapshotFromCsv(options: { csvPath: string; snapshotId: string; year: number; fileName: string }) {
  await ensureDatabase();
  await runDuckDbSql(buildDimensionsSnapshotImportSql(options));
}

export async function createDuckDbImportSessionRepository(): Promise<AsyncImportSessionRepository> {
  if (repositoryPromise) return repositoryPromise;

  repositoryPromise = ensureDatabase().then(() => ({
    async load() {
      const stdout = await runDuckDbSql(`
        SELECT payload::VARCHAR AS payload
        FROM import_sessions
        WHERE session_key = ${sqlString(importSessionStorageKey)}
        LIMIT 1;
      `);
      const rows = JSON.parse(stdout || "[]") as { payload: string }[];
      return rows[0]?.payload ? parsePersistedImportSession(rows[0].payload) : null;
    },
    async save(session) {
      const persistedSession = createPersistedImportSession(session);
      await runDuckDbSql(`
        INSERT OR REPLACE INTO import_sessions (session_key, payload, saved_at)
        VALUES (${sqlString(importSessionStorageKey)}, ${sqlString(JSON.stringify(persistedSession))}::JSON, current_timestamp);
      `);
      return persistedSession;
    },
    async clear() {
      await runDuckDbSql(`DELETE FROM import_sessions WHERE session_key = ${sqlString(importSessionStorageKey)};`);
    },
  }));

  return repositoryPromise;
}

export const importWorkflowDatabasePath = databasePath;
