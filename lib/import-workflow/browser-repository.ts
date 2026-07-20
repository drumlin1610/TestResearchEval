import type { ImportSessionRepository, PersistedImportSession } from "./types";

const importSessionStorageKey = "boris-import-workbench-session";

export function createBrowserImportSessionRepository(storage: Storage): ImportSessionRepository {
  return {
    load() {
      const rawSession = storage.getItem(importSessionStorageKey);
      if (!rawSession) return null;
      return JSON.parse(rawSession) as PersistedImportSession;
    },
    save(session) {
      const persistedSession: PersistedImportSession = {
        ...session,
        savedAt: new Date().toLocaleString("de-CH"),
      };
      storage.setItem(importSessionStorageKey, JSON.stringify(persistedSession));
      return persistedSession;
    },
    clear() {
      storage.removeItem(importSessionStorageKey);
    },
  };
}
