import type { ImportSessionRepository } from "./types";
import { createPersistedImportSession, importSessionStorageKey, parsePersistedImportSession } from "./persistence";

export function createBrowserImportSessionRepository(storage: Storage): ImportSessionRepository {
  return {
    load() {
      const rawSession = storage.getItem(importSessionStorageKey);
      if (!rawSession) return null;
      return parsePersistedImportSession(rawSession);
    },
    save(session) {
      const persistedSession = createPersistedImportSession(session);
      storage.setItem(importSessionStorageKey, JSON.stringify(persistedSession));
      return persistedSession;
    },
    clear() {
      storage.removeItem(importSessionStorageKey);
    },
  };
}
