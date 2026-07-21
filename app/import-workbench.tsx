"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import type { MatchSummary, SourcePublication } from "@/lib/dimensions-matching";
import { createHttpImportSessionRepository } from "@/lib/import-workflow/http-repository";
import {
  borisFieldDefinitions,
  detectBorisColumns,
  getMissingRequiredBorisFields,
  mapRowsToBorisPublications,
} from "@/lib/import-workflow/boris-schema";
import type { ImportJob, ImportRow, JobStatus, WorkflowLogEntry, WorkflowLogLevel } from "@/lib/import-workflow/types";

const statusLabels: Record<JobStatus, string> = {
  draft: "Entwurf",
  ready: "Bereit",
  running: "Läuft",
  completed: "Abgeschlossen",
};

const emptyMatchSummary: MatchSummary = {
  total: 0,
  matched: 0,
  unmatched: 0,
  matchRate: 0,
  averageConfidence: 0,
  byMethod: { doi: 0, pubmedId: 0, title: 0, unmatched: 0 },
  results: [],
};

export function ImportWorkbench() {
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [sources, setSources] = useState<SourcePublication[]>([]);
  const [parseMessage, setParseMessage] = useState("Noch kein BORIS-Export geladen.");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [workflowLog, setWorkflowLog] = useState<WorkflowLogEntry[]>([]);
  const [summary, setSummary] = useState<MatchSummary>(emptyMatchSummary);
  const [matchingMessage, setMatchingMessage] = useState("Noch keine BORIS-Daten für das DuckDB-Matching geladen.");
  const [matchingCandidateCount, setMatchingCandidateCount] = useState(0);
  const [importGridFilter, setImportGridFilter] = useState("");
  const [matchingGridFilter, setMatchingGridFilter] = useState("");

  useEffect(() => {
    const repository = createHttpImportSessionRepository();

    repository.load()
      .then((session) => {
        if (!session) return;
        setFileName(session.fileName);
        setRows(session.rows);
        setSources(session.sources);
        setJob(session.job);
        setLastSavedAt(session.savedAt);
        setWorkflowLog(session.workflowLog);
        setParseMessage(`${session.rows.length} Zeilen aus der Datenbank wiederhergestellt.`);
      })
      .catch(() => {
        setParseMessage("Gespeicherte Importsitzung konnte nicht aus der Datenbank geladen werden.");
      });
  }, []);

  useEffect(() => {
    if (!rows.length && !job) return;

    const repository = createHttpImportSessionRepository();
    repository.save({ fileName, rows, sources, job, workflowLog })
      .then((session) => setLastSavedAt(session.savedAt))
      .catch(() => setParseMessage("Importsitzung konnte nicht in der Datenbank gespeichert werden."));
  }, [fileName, rows, sources, job, workflowLog]);

  useEffect(() => {
    if (!sources.length) {
      setSummary(emptyMatchSummary);
      setMatchingCandidateCount(0);
      setMatchingMessage("Noch keine BORIS-Daten für das DuckDB-Matching geladen.");
      return;
    }

    const controller = new AbortController();
    setMatchingMessage(`${sources.length} BORIS-Zeilen werden gegen importierte Dimensions-Daten geprüft.`);

    fetch("/api/matching/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { summary?: MatchSummary; candidateCount?: number; error?: string } | null;
        if (!response.ok || !payload?.summary) {
          throw new Error(payload?.error ?? `Matching fehlgeschlagen (${response.status}).`);
        }

        setSummary(payload.summary);
        setMatchingCandidateCount(payload.candidateCount ?? 0);
        setMatchingMessage(`${sources.length} BORIS-Zeilen gegen ${payload.candidateCount ?? 0} importierte Dimensions-Kandidaten aus DuckDB verglichen.`);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSummary(emptyMatchSummary);
        setMatchingCandidateCount(0);
        setMatchingMessage(error instanceof Error ? error.message : "Matching gegen DuckDB-Daten fehlgeschlagen.");
      });

    return () => controller.abort();
  }, [sources]);

  const detectedColumns = Object.keys(rows[0] ?? {});
  const borisColumnMapping = detectBorisColumns(detectedColumns);
  const missingRequiredFields = getMissingRequiredBorisFields(borisColumnMapping);
  const rowsWithDoi = sources.filter((source) => source.doi).length;
  const rowsWithPubmed = sources.filter((source) => source.pubmedId).length;
  const rowsWithTitle = sources.filter((source) => source.title).length;
  const matchesWithDimensionsId = summary.results.filter((result) => result.candidate?.id).length;
  const dimensionsIdRate = sources.length ? matchesWithDimensionsId / sources.length : 0;

  const gridColumns = detectedColumns.slice(0, 12);
  const normalizedImportGridFilter = importGridFilter.trim().toLowerCase();
  const filteredRows = normalizedImportGridFilter
    ? rows.filter((row) => Object.values(row).some((value) => value.toLowerCase().includes(normalizedImportGridFilter)))
    : rows;
  const normalizedMatchingGridFilter = matchingGridFilter.trim().toLowerCase();
  const matchingRows = [
    ...summary.results.map((result) => ({
      key: result.source.borisId,
      borisId: result.source.borisId,
      type: result.source.publicationType || "—",
      subtype: result.source.publicationSubtype || "—",
      method: result.method,
      confidence: `${(result.confidence * 100).toFixed(1)}%`,
      dimensionsId: result.candidate?.id ?? "—",
      status: result.method === "unmatched" ? "Nicht gefunden" : "Gefunden",
    })),
  ];
  const filteredMatchingRows = normalizedMatchingGridFilter
    ? matchingRows.filter((row) => Object.values(row).some((value) => value.toLowerCase().includes(normalizedMatchingGridFilter)))
    : matchingRows;

  function appendWorkflowLog(level: WorkflowLogLevel, message: string, details?: string) {
    setWorkflowLog((current) => [{
      id: `log-${Date.now()}-${current.length}`,
      at: new Date().toLocaleString("de-CH"),
      level,
      message,
      details,
    }, ...current].slice(0, 50));
  }

  function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setJob(null);
    appendWorkflowLog("info", "Datei für Import ausgewählt", file.name);
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        const parsedRows = result.data.filter((row) => Object.values(row).some(Boolean));
        setRows(parsedRows);
        setSources(mapRowsToBorisPublications(parsedRows));
        setParseMessage(`${parsedRows.length} Zeilen aus ${file.name} gelesen.`);
        appendWorkflowLog("success", "BORIS-Export gelesen", `${parsedRows.length} Zeilen, ${Object.keys(parsedRows[0] ?? {}).length} Spalten`);
      },
      error: (error) => {
        setParseMessage(`Import fehlgeschlagen: ${error.message}`);
        appendWorkflowLog("error", "Import fehlgeschlagen", error.message);
      },
    });
  }

  function clearSession() {
    createHttpImportSessionRepository().clear()
      .catch(() => setParseMessage("Importsitzung konnte nicht aus der Datenbank gelöscht werden."));
    setFileName("");
    setRows([]);
    setSources([]);
    setJob(null);
    setLastSavedAt(null);
    setWorkflowLog([]);
    setParseMessage("Importdaten und Auftrag wurden aus dem lokalen Zwischenspeicher entfernt.");
  }

  function createJob() {
    const jobId = `auftrag-${Date.now()}`;
    setJob({
      id: jobId,
      name: fileName ? `BORIS-Import ${fileName}` : "BORIS-Import",
      status: "ready",
      progress: 0,
      createdAt: new Date().toLocaleString("de-CH"),
      currentStep: "Auftrag angelegt, Start wartet auf Freigabe.",
    });
    appendWorkflowLog("info", "Auftrag erstellt", jobId);
  }

  function startJob() {
    if (!job) return;
    const steps = [
      "BORIS-Daten validieren",
      "Dimensions-Kandidaten vorbereiten",
      "Matching-Regeln anwenden",
      "Review-Liste und Kennzahlen erzeugen",
      "Prozess abgeschlossen",
    ];
    setJob({ ...job, status: "running", progress: 8, currentStep: steps[0] });
    appendWorkflowLog("info", "Workflow gestartet", job.id);
    steps.forEach((step, index) => {
      window.setTimeout(() => {
        setJob((current) => current && {
          ...current,
          status: index === steps.length - 1 ? "completed" : "running",
          progress: Math.round(((index + 1) / steps.length) * 100),
          currentStep: step,
        });
        appendWorkflowLog(index === steps.length - 1 ? "success" : "info", step, `${Math.round(((index + 1) / steps.length) * 100)}% abgeschlossen`);
      }, (index + 1) * 700);
    });
  }

  return (
    <section className="dashboard-card import-workbench" id="boris-import" aria-labelledby="import-title">
      <div className="section-heading">
        <p className="eyebrow dark">BORIS Import</p>
        <h2 id="import-title">BORIS-Export hochladen, sichten und als Auftrag starten</h2>
        <p>CSV- und TSV-Exporte aus dem BORIS-Portal werden im Browser gelesen. Der Prototyp erkennt typische Spalten für BORIS-ID, DOI, PMID, Titel und Jahr.</p>
      </div>

      <label className="dropzone">
        <span>BORIS-Export auswählen</span>
        <strong>{fileName || "CSV/TSV-Datei hier laden"}</strong>
        <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => handleFile(event.target.files?.[0])} />
      </label>
      <p className="muted">{parseMessage}</p>
      <p className="muted"><strong>Persistenz:</strong> Diese Prototyp-Sitzung wird serverseitig in einer DuckDB-Datenbank gespeichert{lastSavedAt ? ` · zuletzt gespeichert: ${lastSavedAt}` : ""}. Dimensions-Jahresexporte können dadurch später direkt als CSV-Snapshot geladen und lokal für das Matching genutzt werden.</p>

      <div className="cards compact" aria-label="Importsichtung">
        <article><strong>{sources.length}</strong><span>Zeilen erkannt</span></article>
        <article><strong>{rowsWithDoi}</strong><span>mit DOI</span></article>
        <article><strong>{rowsWithPubmed}</strong><span>mit PubMed-ID</span></article>
        <article><strong>{rowsWithTitle}</strong><span>mit Titel</span></article>
      </div>
      <div className="cards compact" aria-label="Matching-Kennzahlen">
        <article><strong>{summary.total}</strong><span>für Matching geprüft</span></article>
        <article><strong>{summary.unmatched}</strong><span>ohne zuverlässigen Treffer</span></article>
        <article><strong>{matchesWithDimensionsId}</strong><span>mit Dimensions-ID gefunden</span></article>
        <article><strong>{(dimensionsIdRate * 100).toFixed(1)}%</strong><span>Dimensions-ID Trefferquote</span></article>
      </div>

      {detectedColumns.length > 0 && <p className="muted"><strong>Erkannte Spalten:</strong> {detectedColumns.join(", ")}</p>}
      {detectedColumns.length > 0 && (
        <div className="schema-list">
          <strong>BORIS-Feldmapping</strong>
          <ul>
            {borisFieldDefinitions.map((definition) => (
              <li key={definition.field}>
                <span>{definition.label}{definition.required ? " *" : ""}</span>
                <code>{borisColumnMapping[definition.field] ?? "nicht erkannt"}</code>
              </li>
            ))}
          </ul>
          {missingRequiredFields.length > 0 && <p className="warning">Fehlende Pflichtfelder: {missingRequiredFields.join(", ")}</p>}
        </div>
      )}

      <div className="workflow-grid">
        <div>
          <h3>Erste Datenvorschau</h3>
          <table>
            <thead><tr><th>BORIS-ID</th><th>DOI</th><th>PMID</th><th>Titel</th></tr></thead>
            <tbody>
              {sources.slice(0, 5).map((source) => (
                <tr key={source.borisId}><td>{source.borisId}</td><td>{source.doi ?? "—"}</td><td>{source.pubmedId ?? "—"}</td><td>{source.title ?? "—"}</td></tr>
              ))}
              {!sources.length && <tr><td colSpan={4}>Nach dem Upload erscheinen hier die ersten fünf Datensätze.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="job-card">
          <h3>Auftrag</h3>
          <p>Aus der Sichtung wird ein verfolgbarer Prozess erstellt. Später kann dieser Schritt serverseitig BigQuery-Abfragen und Review-Freigaben auslösen.</p>
          <div className="button-row">
            <button type="button" onClick={createJob} disabled={!sources.length}>Auftrag erstellen</button>
            <button type="button" className="secondary" onClick={startJob} disabled={!job || job.status === "running" || job.status === "completed"}>Prozess starten</button>
            <button type="button" className="ghost" onClick={clearSession} disabled={!sources.length && !job}>Sitzung löschen</button>
          </div>
          {job && <div className="job-status"><span>{statusLabels[job.status]}</span><strong>{job.progress}%</strong><progress value={job.progress} max={100} /><p>{job.currentStep}</p><small>{job.name} · {job.createdAt}</small></div>}
        </div>
      </div>

      <div className="workflow-log" aria-live="polite">
        <h3>Workflow-Logging</h3>
        <ol>
          {workflowLog.map((entry) => (
            <li key={entry.id} className={`log-${entry.level}`}>
              <time>{entry.at}</time>
              <strong>{entry.message}</strong>
              {entry.details && <span>{entry.details}</span>}
            </li>
          ))}
          {!workflowLog.length && <li className="log-empty">Noch keine Workflow-Ereignisse vorhanden.</li>}
        </ol>
      </div>

      <h3>Alle Importdaten im Grid</h3>
      <label className="table-filter">
        <span>Importdaten filtern</span>
        <input value={importGridFilter} onChange={(event) => setImportGridFilter(event.target.value)} placeholder="Suchtext in allen Spalten" />
      </label>
      <div className="data-grid" role="region" aria-label="Alle importierten BORIS-Daten" tabIndex={0}>
        <table>
          <thead>
            <tr>
              {gridColumns.map((column) => <th key={column}>{column}</th>)}
              {!gridColumns.length && <th>Importdaten</th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {gridColumns.map((column) => <td key={`${rowIndex}-${column}`}>{row[column] || "—"}</td>)}
              </tr>
            ))}
            {!rows.length && <tr><td>Nach dem Upload wird jede importierte Zeile in diesem Grid angezeigt.</td></tr>}
            {rows.length > 0 && !filteredRows.length && <tr><td colSpan={Math.max(gridColumns.length, 1)}>Keine Importzeilen für diesen Filter gefunden.</td></tr>}
          </tbody>
        </table>
      </div>
      {detectedColumns.length > gridColumns.length && <p className="muted">Das Grid zeigt die ersten {gridColumns.length} von {detectedColumns.length} Spalten, um die Sichtung lesbar zu halten.</p>}

      <h3>Matching gegen importierte Dimensions-Daten</h3>
      <p className="muted">{matchingMessage}{matchingCandidateCount > 0 ? ` · Kandidaten: ${matchingCandidateCount}` : ""}</p>
      <p className="muted">Angezeigt werden alle BORIS-Zeilen mit Matchstatus, Methode, Confidence und gefundener Dimensions-ID.</p>
      <label className="table-filter">
        <span>Matching-Ergebnisse filtern</span>
        <input value={matchingGridFilter} onChange={(event) => setMatchingGridFilter(event.target.value)} placeholder="BORIS-ID, Methode, Typ, Subtyp oder Dimensions-ID" />
      </label>
      <div className="data-grid" role="region" aria-label="Matching-Ergebnisse" tabIndex={0}>
        <table>
          <thead><tr><th>BORIS-ID</th><th>Typ</th><th>Subtyp</th><th>Status</th><th>Methode</th><th>Confidence</th><th>Dimensions ID</th></tr></thead>
          <tbody>
            {filteredMatchingRows.map((row) => <tr key={row.key}><td>{row.borisId}</td><td>{row.type}</td><td>{row.subtype}</td><td>{row.status}</td><td>{row.method}</td><td>{row.confidence}</td><td>{row.dimensionsId}</td></tr>)}
            {!matchingRows.length && <tr><td colSpan={7}>Noch keine Importdaten für ein Matching vorhanden.</td></tr>}
            {matchingRows.length > 0 && !filteredMatchingRows.length && <tr><td colSpan={7}>Keine Matching-Zeilen für diesen Filter gefunden.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
