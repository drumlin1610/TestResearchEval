import type { ImportSessionDraft, PersistedImportSession } from "./types";

export const importSessionStorageKey = "boris-import-workbench-session";

const emptySession: ImportSessionDraft = {
  fileName: "",
  rows: [],
  sources: [],
  job: null,
  workflowLog: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function createPersistedImportSession(session: Partial<Record<keyof ImportSessionDraft, unknown>>, savedAt = new Date().toLocaleString("de-CH")): PersistedImportSession {
  return {
    fileName: asString(session.fileName, emptySession.fileName),
    rows: asArray<PersistedImportSession["rows"][number]>(session.rows),
    sources: asArray<PersistedImportSession["sources"][number]>(session.sources),
    job: isRecord(session.job) ? session.job as PersistedImportSession["job"] : emptySession.job,
    workflowLog: asArray<PersistedImportSession["workflowLog"][number]>(session.workflowLog),
    savedAt,
  };
}

export function parsePersistedImportSession(rawSession: string): PersistedImportSession {
  const parsed = JSON.parse(rawSession) as unknown;
  if (!isRecord(parsed)) throw new Error("Persisted import session must be an object.");

  return createPersistedImportSession({
    fileName: parsed.fileName,
    rows: parsed.rows,
    sources: parsed.sources,
    job: isRecord(parsed.job) ? parsed.job as PersistedImportSession["job"] : null,
    workflowLog: parsed.workflowLog,
  }, asString(parsed.savedAt, new Date().toLocaleString("de-CH")));
}
