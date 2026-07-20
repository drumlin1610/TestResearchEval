import type { AsyncImportSessionRepository, ImportSessionDraft, PersistedImportSession } from "./types";

type ImportSessionResponse = {
  session: PersistedImportSession | null;
};

async function readSessionResponse(response: Response) {
  if (!response.ok) throw new Error(`Import session request failed with ${response.status}.`);
  return await response.json() as ImportSessionResponse;
}

export function createHttpImportSessionRepository(endpoint = "/api/import-session"): AsyncImportSessionRepository {
  return {
    async load() {
      const payload = await readSessionResponse(await fetch(endpoint));
      return payload.session;
    },
    async save(session: ImportSessionDraft) {
      const payload = await readSessionResponse(await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(session),
      }));
      if (!payload.session) throw new Error("Import session API did not return a saved session.");
      return payload.session;
    },
    async clear() {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) throw new Error(`Import session delete failed with ${response.status}.`);
    },
  };
}
