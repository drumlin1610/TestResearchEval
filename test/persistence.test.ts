import { describe, expect, it } from "vitest";
import { createPersistedImportSession, parsePersistedImportSession } from "../lib/import-workflow/persistence";

describe("import workflow persistence", () => {
  it("persists workflow log entries with imported rows", () => {
    const session = createPersistedImportSession({
      fileName: "boris.csv",
      rows: [{ BorisID: "B1", Titel: "Demo" }],
      sources: [{ borisId: "B1", title: "Demo" }],
      job: null,
      workflowLog: [{ id: "log-1", at: "20.07.2026, 09:00:00", level: "success", message: "Import gelesen" }],
    }, "20.07.2026, 09:01:00");

    expect(session).toMatchObject({
      fileName: "boris.csv",
      rows: [{ BorisID: "B1", Titel: "Demo" }],
      workflowLog: [{ message: "Import gelesen" }],
      savedAt: "20.07.2026, 09:01:00",
    });
  });

  it("normalizes older sessions without workflow logs", () => {
    expect(parsePersistedImportSession(JSON.stringify({ fileName: "legacy.csv", rows: [], sources: [], savedAt: "legacy" }))).toMatchObject({
      fileName: "legacy.csv",
      workflowLog: [],
      savedAt: "legacy",
    });
  });
});
