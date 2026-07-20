import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AsyncImportSessionRepository } from "./types";
import { createPersistedImportSession, importSessionStorageKey, parsePersistedImportSession } from "./persistence";

type DuckDBConnection = {
  run(sql: string, values?: Record<string, unknown>): Promise<unknown>;
  runAndReadAll(sql: string, values?: Record<string, unknown>): Promise<{ getRowObjects(): unknown[] }>;
};

type DuckDBInstance = {
  connect(): Promise<DuckDBConnection>;
};

export type DimensionsSnapshotRow = Record<string, unknown>;

type DuckDBNodeApi = {
  DuckDBInstance: {
    fromCache(databasePath: string): Promise<DuckDBInstance>;
  };
};

const duckDbPackageName = "@duckdb/node-api";
const databaseDirectory = path.join(process.cwd(), "data");
const databasePath = path.join(databaseDirectory, "research-eval.duckdb");

let connectionPromise: Promise<DuckDBConnection> | null = null;
let repositoryPromise: Promise<AsyncImportSessionRepository> | null = null;
let databaseReadyPromise: Promise<void> | null = null;

async function loadDuckDbApi() {
  return await import(/* webpackIgnore: true */ duckDbPackageName) as DuckDBNodeApi;
}

async function getConnection(): Promise<DuckDBConnection> {
  if (connectionPromise) return connectionPromise;

  connectionPromise = mkdir(databaseDirectory, { recursive: true }).then(async () => {
    const { DuckDBInstance } = await loadDuckDbApi();
    const instance = await DuckDBInstance.fromCache(databasePath);
    return await instance.connect();
  });

  return connectionPromise;
}

async function runDuckDbSql(sql: string, values?: Record<string, unknown>) {
  const connection = await getConnection();
  await connection.run(sql, values);
}

async function readDuckDbRows<Row>(sql: string, values?: Record<string, unknown>) {
  const connection = await getConnection();
  const reader = await connection.runAndReadAll(sql, values);
  return reader.getRowObjects() as Row[];
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
  `);

  return databaseReadyPromise;
}

export function buildDimensionsSnapshotImportSql() {
  return `
    CREATE OR REPLACE TEMP TABLE imported_dimensions AS
      SELECT * FROM read_csv_auto($csvPath, header = true, ignore_errors = true);

    DELETE FROM dimensions_publications WHERE snapshot_id = $snapshotId;
    DELETE FROM dimensions_snapshots WHERE id = $snapshotId;

    INSERT INTO dimensions_snapshots (id, year, file_name, row_count, status)
      SELECT $snapshotId, $year, $fileName, count(*), 'active'
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
      $snapshotId AS snapshot_id,
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
  await runDuckDbSql(buildDimensionsSnapshotImportSql(), options);
}

function getTextValue(row: DimensionsSnapshotRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function getIntegerValue(row: DimensionsSnapshotRow, keys: string[], fallback: number) {
  const value = getTextValue(row, keys);
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function buildDimensionsSnapshotInsertSql() {
  return `
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
    ) VALUES (
      $id,
      $snapshotId,
      $doi,
      $pubmedId,
      $title,
      lower(regexp_replace(regexp_replace(coalesce($doi, ''), '^https?://(dx\\.)?doi\\.org/', ''), '^doi:', '')),
      regexp_replace(coalesce($pubmedId, ''), '[^0-9]', '', 'g'),
      lower(regexp_replace(coalesce($title, ''), '[^[:alnum:] ]', ' ', 'g')),
      $publicationYear,
      $rawPayload::JSON
    );
  `;
}

export async function importDimensionsSnapshotFromRows(options: { snapshotId: string; year: number; fileName: string; rows: DimensionsSnapshotRow[] }) {
  await ensureDatabase();
  await runDuckDbSql("BEGIN TRANSACTION;");

  try {
    await runDuckDbSql("DELETE FROM dimensions_publications WHERE snapshot_id = $snapshotId;", { snapshotId: options.snapshotId });
    await runDuckDbSql("DELETE FROM dimensions_snapshots WHERE id = $snapshotId;", { snapshotId: options.snapshotId });

    const insertPublicationSql = buildDimensionsSnapshotInsertSql();
    let insertedRows = 0;

    for (const row of options.rows) {
      const id = getTextValue(row, ["id", "publication_id", "dimensions_id"]);
      if (!id) continue;

      await runDuckDbSql(insertPublicationSql, {
        id,
        snapshotId: options.snapshotId,
        doi: getTextValue(row, ["doi", "DOI"]),
        pubmedId: getTextValue(row, ["pubmed_id", "pubmedId", "pmid", "PMID"]),
        title: getTextValue(row, ["title", "Title"]),
        publicationYear: getIntegerValue(row, ["year", "publication_year", "publicationYear"], options.year),
        rawPayload: JSON.stringify(row),
      });
      insertedRows += 1;
    }

    await runDuckDbSql(`
      INSERT INTO dimensions_snapshots (id, year, file_name, row_count, status)
      VALUES ($snapshotId, $year, $fileName, $rowCount, 'active');
    `, { snapshotId: options.snapshotId, year: options.year, fileName: options.fileName, rowCount: insertedRows });
    await runDuckDbSql("COMMIT;");
    return insertedRows;
  } catch (error) {
    await runDuckDbSql("ROLLBACK;").catch(() => undefined);
    throw error;
  }
}

export async function createDuckDbImportSessionRepository(): Promise<AsyncImportSessionRepository> {
  if (repositoryPromise) return repositoryPromise;

  repositoryPromise = ensureDatabase().then(() => ({
    async load() {
      const rows = await readDuckDbRows<{ payload: string }>(`
        SELECT payload::VARCHAR AS payload
        FROM import_sessions
        WHERE session_key = $sessionKey
        LIMIT 1;
      `, { sessionKey: importSessionStorageKey });
      return rows[0]?.payload ? parsePersistedImportSession(rows[0].payload) : null;
    },
    async save(session) {
      const persistedSession = createPersistedImportSession(session);
      await runDuckDbSql(`
        INSERT OR REPLACE INTO import_sessions (session_key, payload, saved_at)
        VALUES ($sessionKey, $payload::JSON, current_timestamp);
      `, { sessionKey: importSessionStorageKey, payload: JSON.stringify(persistedSession) });
      return persistedSession;
    },
    async clear() {
      await runDuckDbSql("DELETE FROM import_sessions WHERE session_key = $sessionKey;", { sessionKey: importSessionStorageKey });
    },
  }));

  return repositoryPromise;
}

export const importWorkflowDatabasePath = databasePath;
