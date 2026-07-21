import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AsyncImportSessionRepository } from "./types";
import {
  createPersistedImportSession,
  importSessionStorageKey,
  parsePersistedImportSession,
} from "./persistence";

type DuckDBConnection = {
  runAndReadAll(
    sql: string,
    values?: Record<string, unknown>,
  ): Promise<{
    getRowObjects(): unknown[];
  }>;
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

// === ÄNDERUNG: Globale Speicherung für Next.js Hot Reload ===

type DuckDbGlobal = typeof globalThis & {
  duckDbConnectionPromise?: Promise<DuckDBConnection>;
  duckDbReadyPromise?: Promise<void>;
};

const duckDbGlobal = globalThis as DuckDbGlobal;

// === ENDE ÄNDERUNG ===

const duckDbPackageName = "@duckdb/node-api";
const databaseDirectory = path.join(process.cwd(), "data");
const databasePath = path.join(
  databaseDirectory,
  "research-eval.duckdb",
);

const duckDbStatementTimeoutMs = Number(
  process.env.DUCKDB_STATEMENT_TIMEOUT_MS ?? 120_000,
);

// Connection und Datenbankinitialisierung werden jetzt über globalThis
// gespeichert. repositoryPromise darf weiterhin lokal bleiben.
let repositoryPromise:
  | Promise<AsyncImportSessionRepository>
  | null = null;

async function loadDuckDbApi() {
  return (await import(
    /* webpackIgnore: true */ duckDbPackageName
  )) as DuckDBNodeApi;
}

// === ÄNDERUNG: Globale Singleton-Connection ===

async function getConnection(): Promise<DuckDBConnection> {
  console.info("[duckdb:connection] getConnection called", {
    cached: Boolean(duckDbGlobal.duckDbConnectionPromise),
  });

  if (duckDbGlobal.duckDbConnectionPromise) {
    return duckDbGlobal.duckDbConnectionPromise;
  }

  duckDbGlobal.duckDbConnectionPromise = (async () => {
    console.info("[duckdb:connection] Creating data directory", {
      databaseDirectory,
    });

    await mkdir(databaseDirectory, { recursive: true });

    console.info("[duckdb:connection] Loading DuckDB package", {
      package: duckDbPackageName,
    });

    const { DuckDBInstance } = await loadDuckDbApi();

    console.info("[duckdb:connection] DuckDB package loaded");

    console.info("[duckdb:connection] Opening database", {
      databasePath,
    });

    const instance =
      await DuckDBInstance.fromCache(databasePath);

    console.info("[duckdb:connection] Database opened");
    console.info(
      "[duckdb:connection] Establishing connection",
    );

    const connection = await instance.connect();

    console.info(
      "[duckdb:connection] Connection established",
    );

    return connection;
  })().catch((error) => {
    // Nach einem Fehler soll ein neuer Versuch möglich sein.
    duckDbGlobal.duckDbConnectionPromise = undefined;

    console.error("[duckdb:connection] Connection failed", {
      databasePath,
      error,
    });

    throw error;
  });

  return duckDbGlobal.duckDbConnectionPromise;
}

// === ENDE ÄNDERUNG ===

function duckDbJsonPath(key: string) {
  return `$.${JSON.stringify(key)}`;
}

function jsonTextCoalesceSql(
  jsonColumn: string,
  keys: string[],
) {
  return `coalesce(${keys
    .map(
      (key) =>
        `json_extract_string(${jsonColumn}, '${duckDbJsonPath(key)}')`,
    )
    .join(", ")}, '')`;
}

function summarizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().slice(0, 160);
}

async function withDuckDbStatementTimeout<T>(
  operation: Promise<T>,
  sql: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(
          `DuckDB statement timed out after ${duckDbStatementTimeoutMs}ms: ${summarizeSql(sql)}`,
        ),
      );
    }, duckDbStatementTimeoutMs);
  });

  try {
    return await Promise.race([
      operation,
      timeoutPromise,
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function runDuckDbSql(
  sql: string,
  values?: Record<string, unknown>,
) {
  const connection = await getConnection();
  const startedAt = Date.now();
  const summary = summarizeSql(sql);

  console.info("[duckdb:sql] Running statement", {
    sql: summary,
    hasValues: Boolean(
      values && Object.keys(values).length,
    ),
  });

  try {
    await withDuckDbStatementTimeout(
      connection.runAndReadAll(sql, values),
      sql,
    );

    console.info("[duckdb:sql] Statement completed", {
      sql: summary,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[duckdb:sql] Statement failed", {
      sql: summary,
      durationMs: Date.now() - startedAt,
      error,
    });

    throw error;
  }
}

async function readDuckDbRows<Row>(
  sql: string,
  values?: Record<string, unknown>,
) {
  const connection = await getConnection();
  const reader = await connection.runAndReadAll(
    sql,
    values,
  );

  return reader.getRowObjects() as Row[];
}

async function initializeDatabase() {
  console.info("[duckdb:init] Ensuring DuckDB schema", {
    databasePath,
  });

  const statements = [
    {
      label: "import_sessions table",
      sql: `
        CREATE TABLE IF NOT EXISTS import_sessions (
          session_key VARCHAR PRIMARY KEY,
          payload JSON NOT NULL,
          saved_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        );
      `,
    },
    {
      label: "dimensions_snapshots table",
      sql: `
        CREATE TABLE IF NOT EXISTS dimensions_snapshots (
          id VARCHAR PRIMARY KEY,
          year INTEGER NOT NULL,
          file_name VARCHAR NOT NULL,
          imported_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
          row_count INTEGER NOT NULL,
          status VARCHAR NOT NULL DEFAULT 'active'
        );
      `,
    },
    {
      label: "dimensions_publications table",
      sql: `
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
      `,
    },
    {
      label: "dimensions_publications DOI index",
      sql: `
        CREATE INDEX IF NOT EXISTS idx_dimensions_publications_doi
        ON dimensions_publications(normalized_doi);
      `,
    },
    {
      label: "dimensions_publications PubMed index",
      sql: `
        CREATE INDEX IF NOT EXISTS idx_dimensions_publications_pubmed
        ON dimensions_publications(normalized_pubmed_id);
      `,
    },
    {
      label: "dimensions_publications title index",
      sql: `
        CREATE INDEX IF NOT EXISTS idx_dimensions_publications_title
        ON dimensions_publications(normalized_title);
      `,
    },
    {
      label: "dimensions_publications snapshot index",
      sql: `
        CREATE INDEX IF NOT EXISTS idx_dimensions_publications_snapshot
        ON dimensions_publications(snapshot_id);
      `,
    },
  ];

  for (const statement of statements) {
    console.info(
      "[duckdb:init] Running schema statement",
      {
        label: statement.label,
      },
    );

    await runDuckDbSql(statement.sql);

    console.info(
      "[duckdb:init] Schema statement completed",
      {
        label: statement.label,
      },
    );
  }

  console.info("[duckdb:init] DuckDB schema ready", {
    databasePath,
  });
}

// === ÄNDERUNG: Globale Initialisierungs-Promise ===

async function ensureDatabase(): Promise<void> {
  console.info("[duckdb:init] ensureDatabase called", {
    cached: Boolean(duckDbGlobal.duckDbReadyPromise),
  });

  if (duckDbGlobal.duckDbReadyPromise) {
    console.info(
      "[duckdb:init] Using existing initialization promise",
    );

    return duckDbGlobal.duckDbReadyPromise;
  }

  console.info(
    "[duckdb:init] Starting database initialization",
  );

  duckDbGlobal.duckDbReadyPromise =
    initializeDatabase()
      .then(() => {
        console.info(
          "[duckdb:init] Database initialization completed",
        );
      })
      .catch((error) => {
        // Nach einem Fehler soll ein neuer Versuch möglich sein.
        duckDbGlobal.duckDbReadyPromise = undefined;

        console.error(
          "[duckdb:init] DuckDB schema initialization failed",
          {
            databasePath,
            error,
          },
        );

        throw error;
      });

  return duckDbGlobal.duckDbReadyPromise;
}

// === ENDE ÄNDERUNG ===

export function buildDimensionsSnapshotImportSql() {
  const idSql = jsonTextCoalesceSql("raw_json", [
    "id",
    "publication_id",
    "publicationId",
    "dimensions_id",
    "Dimensions ID",
    "Publication ID",
  ]);

  const doiSql = jsonTextCoalesceSql("raw_json", [
    "doi",
    "DOI",
  ]);

  const pubmedIdSql = jsonTextCoalesceSql("raw_json", [
    "pubmed_id",
    "pubmedId",
    "pmid",
    "PMID",
    "PubMed ID",
  ]);

  const titleSql = jsonTextCoalesceSql("raw_json", [
    "title",
    "Title",
  ]);

  const yearSql = jsonTextCoalesceSql("raw_json", [
    "year",
    "publication_year",
    "publicationYear",
    "Year",
    "Publication Year",
  ]);

  return `
    CREATE OR REPLACE TEMP TABLE imported_dimensions_raw AS
      SELECT to_json(csv_row) AS raw_json
      FROM read_csv_auto(
        $csvPath,
        header = true,
        ignore_errors = true
      ) AS csv_row;

    CREATE OR REPLACE TEMP TABLE imported_dimensions AS
      SELECT
        ${idSql} AS id,
        ${doiSql} AS doi,
        ${pubmedIdSql} AS pubmed_id,
        ${titleSql} AS title,
        ${yearSql} AS year,
        raw_json
      FROM imported_dimensions_raw;

    DELETE FROM dimensions_publications
    WHERE snapshot_id = $snapshotId;

    DELETE FROM dimensions_snapshots
    WHERE id = $snapshotId;

    INSERT INTO dimensions_snapshots (
      id,
      year,
      file_name,
      row_count,
      status
    )
    SELECT
      $snapshotId,
      $year,
      $fileName,
      count(*),
      'active'
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
      lower(
        regexp_replace(
          regexp_replace(
            coalesce(doi, ''),
            '^https?://(dx\\.)?doi\\.org/',
            ''
          ),
          '^doi:',
          ''
        )
      ) AS normalized_doi,
      regexp_replace(
        coalesce(pubmed_id, ''),
        '[^0-9]',
        '',
        'g'
      ) AS normalized_pubmed_id,
      lower(
        regexp_replace(
          coalesce(title, ''),
          '[^[:alnum:] ]',
          ' ',
          'g'
        )
      ) AS normalized_title,
      try_cast(year AS INTEGER) AS year,
      raw_json AS raw_payload
    FROM imported_dimensions
    WHERE id IS NOT NULL
      AND id != '';
  `;
}

export async function importDimensionsSnapshotFromCsv(
  options: {
    csvPath: string;
    snapshotId: string;
    year: number;
    fileName: string;
  },
) {
  await ensureDatabase();

  await runDuckDbSql(
    buildDimensionsSnapshotImportSql(),
    options,
  );
}

function getTextValue(
  row: DimensionsSnapshotRow,
  keys: string[],
) {
  for (const key of keys) {
    const value = row[key];

    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();

    if (text) {
      return text;
    }
  }

  return "";
}

function getIntegerValue(
  row: DimensionsSnapshotRow,
  keys: string[],
  fallback: number,
) {
  const value = getTextValue(row, keys);
  const parsed = Number(value);

  return Number.isInteger(parsed)
    ? parsed
    : fallback;
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
    )
    VALUES (
      $id,
      $snapshotId,
      $doi,
      $pubmedId,
      $title,
      lower(
        regexp_replace(
          regexp_replace(
            coalesce($doi, ''),
            '^https?://(dx\\.)?doi\\.org/',
            ''
          ),
          '^doi:',
          ''
        )
      ),
      regexp_replace(
        coalesce($pubmedId, ''),
        '[^0-9]',
        '',
        'g'
      ),
      lower(
        regexp_replace(
          coalesce($title, ''),
          '[^[:alnum:] ]',
          ' ',
          'g'
        )
      ),
      $publicationYear,
      $rawPayload::JSON
    );
  `;
}

export async function importDimensionsSnapshotFromRows(
  options: {
    snapshotId: string;
    year: number;
    fileName: string;
    rows: DimensionsSnapshotRow[];
  },
) {
  console.info(
    "[dimensions:insert] Preparing row-based Dimensions snapshot import",
    {
      snapshotId: options.snapshotId,
      year: options.year,
      fileName: options.fileName,
      receivedRows: options.rows.length,
    },
  );

  await ensureDatabase();

  console.info(
    "[dimensions:insert] DuckDB schema is ready",
    {
      snapshotId: options.snapshotId,
    },
  );

  try {
    console.info(
      "[dimensions:insert] Clearing existing publication rows",
      {
        snapshotId: options.snapshotId,
      },
    );

    await runDuckDbSql(
      `
        DELETE FROM dimensions_publications
        WHERE snapshot_id = $snapshotId;
      `,
      {
        snapshotId: options.snapshotId,
      },
    );

    console.info(
      "[dimensions:insert] Existing publication rows cleared",
      {
        snapshotId: options.snapshotId,
      },
    );

    console.info(
      "[dimensions:insert] Clearing existing snapshot metadata",
      {
        snapshotId: options.snapshotId,
      },
    );

    await runDuckDbSql(
      `
        DELETE FROM dimensions_snapshots
        WHERE id = $snapshotId;
      `,
      {
        snapshotId: options.snapshotId,
      },
    );

    console.info(
      "[dimensions:insert] Existing snapshot metadata cleared",
      {
        snapshotId: options.snapshotId,
      },
    );

    const insertPublicationSql =
      buildDimensionsSnapshotInsertSql();

    let insertedRows = 0;

    for (const [rowIndex, row] of options.rows.entries()) {
      const processedRows = rowIndex + 1;

      const id = getTextValue(row, [
        "id",
        "publication_id",
        "publicationId",
        "dimensions_id",
        "Dimensions ID",
        "Publication ID",
      ]);

      if (!id) {
        console.warn(
          "[dimensions:insert] Skipping row without Dimensions id",
          {
            snapshotId: options.snapshotId,
            rowNumber: processedRows,
          },
        );

        continue;
      }

      if (insertedRows === 0) {
        console.info(
          "[dimensions:insert] Starting row inserts",
          {
            snapshotId: options.snapshotId,
          },
        );
      }

      await runDuckDbSql(insertPublicationSql, {
        id,
        snapshotId: options.snapshotId,

        doi: getTextValue(row, [
          "doi",
          "DOI",
        ]),

        pubmedId: getTextValue(row, [
          "pubmed_id",
          "pubmedId",
          "pmid",
          "PMID",
          "PubMed ID",
        ]),

        title: getTextValue(row, [
          "title",
          "Title",
        ]),

        publicationYear: getIntegerValue(
          row,
          [
            "year",
            "publication_year",
            "publicationYear",
            "Year",
            "Publication Year",
          ],
          options.year,
        ),

        rawPayload: JSON.stringify(row),
      });

      insertedRows += 1;

      if (
        insertedRows === 1 ||
        processedRows % 1000 === 0 ||
        processedRows === options.rows.length
      ) {
        console.info(
          "[dimensions:insert] Insert progress",
          {
            snapshotId: options.snapshotId,
            processedRows,
            insertedRows,
            receivedRows: options.rows.length,
          },
        );
      }
    }

    console.info(
      "[dimensions:insert] Writing snapshot metadata",
      {
        snapshotId: options.snapshotId,
        insertedRows,
      },
    );

    await runDuckDbSql(
      `
        INSERT INTO dimensions_snapshots (
          id,
          year,
          file_name,
          row_count,
          status
        )
        VALUES (
          $snapshotId,
          $year,
          $fileName,
          $rowCount,
          'active'
        );
      `,
      {
        snapshotId: options.snapshotId,
        year: options.year,
        fileName: options.fileName,
        rowCount: insertedRows,
      },
    );

    console.info(
      "[dimensions:insert] Import completed",
      {
        snapshotId: options.snapshotId,
        insertedRows,
        skippedRows:
          options.rows.length - insertedRows,
      },
    );

    return insertedRows;
  } catch (error) {
    console.error(
      "[dimensions:insert] Import failed",
      {
        snapshotId: options.snapshotId,
        error,
      },
    );

    throw error;
  }
}

export async function createDuckDbImportSessionRepository(): Promise<AsyncImportSessionRepository> {
  if (repositoryPromise) {
    return repositoryPromise;
  }

  repositoryPromise = ensureDatabase().then(() => ({
    async load() {
      const rows = await readDuckDbRows<{
        payload: string;
      }>(
        `
          SELECT payload::VARCHAR AS payload
          FROM import_sessions
          WHERE session_key = $sessionKey
          LIMIT 1;
        `,
        {
          sessionKey: importSessionStorageKey,
        },
      );

      return rows[0]?.payload
        ? parsePersistedImportSession(rows[0].payload)
        : null;
    },

    async save(session) {
      const persistedSession =
        createPersistedImportSession(session);

      await runDuckDbSql(
        `
          INSERT OR REPLACE INTO import_sessions (
            session_key,
            payload,
            saved_at
          )
          VALUES (
            $sessionKey,
            $payload::JSON,
            current_timestamp
          );
        `,
        {
          sessionKey: importSessionStorageKey,
          payload: JSON.stringify(persistedSession),
        },
      );

      return persistedSession;
    },

    async clear() {
      await runDuckDbSql(
        `
          DELETE FROM import_sessions
          WHERE session_key = $sessionKey;
        `,
        {
          sessionKey: importSessionStorageKey,
        },
      );
    },
  }));

  return repositoryPromise;
}

export const importWorkflowDatabasePath = databasePath;