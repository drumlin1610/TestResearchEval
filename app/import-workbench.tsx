"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { matchPublications, type SourcePublication } from "@/lib/dimensions-matching";
import { createBrowserImportSessionRepository } from "@/lib/import-workflow/browser-repository";
import type { ImportJob, ImportRow, JobStatus } from "@/lib/import-workflow/types";

const borisColumnAliases = {
  borisId: ["borisid", "boris_id", "id", "recordid", "record_id", "publicationid", "publication_id"],
  doi: ["doi", "digitalobjectidentifier"],
  pubmedId: ["pubmedid", "pubmed_id", "pmid", "pubmed"],
  title: ["title", "titel", "publicationtitle", "publication_title"],
  year: ["year", "jahr", "publicationyear", "publication_year"],
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], aliases: string[]) {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  return aliases.map((alias) => normalized.get(normalizeHeader(alias))).find(Boolean);
}

function mapRowsToPublications(rows: ImportRow[]): SourcePublication[] {
  const headers = Object.keys(rows[0] ?? {});
  const borisIdColumn = findColumn(headers, borisColumnAliases.borisId);
  const doiColumn = findColumn(headers, borisColumnAliases.doi);
  const pubmedColumn = findColumn(headers, borisColumnAliases.pubmedId);
  const titleColumn = findColumn(headers, borisColumnAliases.title);
  const yearColumn = findColumn(headers, borisColumnAliases.year);

  return rows.map((row, index) => ({
    borisId: row[borisIdColumn ?? ""] || `BORIS-IMPORT-${index + 1}`,
    doi: doiColumn ? row[doiColumn] : undefined,
    pubmedId: pubmedColumn ? row[pubmedColumn] : undefined,
    title: titleColumn ? row[titleColumn] : undefined,
    year: yearColumn && row[yearColumn] ? Number(row[yearColumn]) : undefined,
  }));
}

const demoDimensionsCandidates = [
  { id: "pub.1", doi: "10.1000/demo.1", title: "Research evaluation with reliable metadata", year: 2024 },
  { id: "pub.2", pubmedId: "987654", title: "Biomedical impact analysis", year: 2023 },
  { id: "pub.3", doi: "10.5281/zenodo.42", title: "Open science metrics for institutional reports", year: 2022 },
];

const statusLabels: Record<JobStatus, string> = {
  draft: "Entwurf",
  ready: "Bereit",
  running: "Läuft",
  completed: "Abgeschlossen",
};

export function ImportWorkbench() {
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [sources, setSources] = useState<SourcePublication[]>([]);
  const [parseMessage, setParseMessage] = useState("Noch kein BORIS-Export geladen.");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const repository = createBrowserImportSessionRepository(window.localStorage);

    try {
      const session = repository.load();
      if (!session) return;
      setFileName(session.fileName);
      setRows(session.rows);
      setSources(session.sources);
      setJob(session.job);
      setLastSavedAt(session.savedAt);
      setParseMessage(`${session.rows.length} Zeilen aus dem lokalen Zwischenspeicher wiederhergestellt.`);
    } catch {
      createBrowserImportSessionRepository(window.localStorage).clear();
      setParseMessage("Gespeicherte Importsitzung war ungültig und wurde verworfen.");
    }
  }, []);

  useEffect(() => {
    if (!rows.length && !job) return;

    const repository = createBrowserImportSessionRepository(window.localStorage);
    const session = repository.save({ fileName, rows, sources, job });
    setLastSavedAt(session.savedAt);
  }, [fileName, rows, sources, job]);

  const summary = useMemo(() => matchPublications(sources, demoDimensionsCandidates), [sources]);
  const detectedColumns = Object.keys(rows[0] ?? {});
  const rowsWithDoi = sources.filter((source) => source.doi).length;
  const rowsWithPubmed = sources.filter((source) => source.pubmedId).length;
  const rowsWithTitle = sources.filter((source) => source.title).length;

  function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setJob(null);
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        const parsedRows = result.data.filter((row) => Object.values(row).some(Boolean));
        setRows(parsedRows);
        setSources(mapRowsToPublications(parsedRows));
        setParseMessage(`${parsedRows.length} Zeilen aus ${file.name} gelesen.`);
      },
      error: (error) => setParseMessage(`Import fehlgeschlagen: ${error.message}`),
    });
  }

  function clearSession() {
    createBrowserImportSessionRepository(window.localStorage).clear();
    setFileName("");
    setRows([]);
    setSources([]);
    setJob(null);
    setLastSavedAt(null);
    setParseMessage("Importdaten und Auftrag wurden aus dem lokalen Zwischenspeicher entfernt.");
  }

  function createJob() {
    setJob({
      id: `auftrag-${Date.now()}`,
      name: fileName ? `BORIS-Import ${fileName}` : "BORIS-Import",
      status: "ready",
      progress: 0,
      createdAt: new Date().toLocaleString("de-CH"),
      currentStep: "Auftrag angelegt, Start wartet auf Freigabe.",
    });
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
    steps.forEach((step, index) => {
      window.setTimeout(() => {
        setJob((current) => current && {
          ...current,
          status: index === steps.length - 1 ? "completed" : "running",
          progress: Math.round(((index + 1) / steps.length) * 100),
          currentStep: step,
        });
      }, (index + 1) * 700);
    });
  }

  return (
    <section className="panel import-workbench" aria-labelledby="import-title">
      <div className="section-heading">
        <p className="eyebrow dark">BORIS-Import</p>
        <h2 id="import-title">Export hochladen, sichten und als Auftrag starten</h2>
        <p>CSV- und TSV-Exporte aus dem BORIS-Portal werden im Browser gelesen. Der Prototyp erkennt typische Spalten für BORIS-ID, DOI, PMID, Titel und Jahr.</p>
      </div>

      <label className="dropzone">
        <span>BORIS-Export auswählen</span>
        <strong>{fileName || "CSV/TSV-Datei hier laden"}</strong>
        <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => handleFile(event.target.files?.[0])} />
      </label>
      <p className="muted">{parseMessage}</p>
      <p className="muted"><strong>Persistenz:</strong> Diese Prototyp-Sitzung wird lokal im Browser gespeichert{lastSavedAt ? ` · zuletzt gespeichert: ${lastSavedAt}` : ""}. Für produktive Läufe ist die Schnittstelle so vorbereitet, dass später serverseitig DuckDB, SQLite/Postgres oder ein Objekt-Storage angebunden werden kann.</p>

      <div className="cards compact" aria-label="Importsichtung">
        <article><strong>{sources.length}</strong><span>Zeilen erkannt</span></article>
        <article><strong>{rowsWithDoi}</strong><span>mit DOI</span></article>
        <article><strong>{rowsWithPubmed}</strong><span>mit PubMed-ID</span></article>
        <article><strong>{rowsWithTitle}</strong><span>mit Titel</span></article>
      </div>

      {detectedColumns.length > 0 && <p className="muted"><strong>Erkannte Spalten:</strong> {detectedColumns.join(", ")}</p>}

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

      <h3>Vorläufiges Matching gegen Demo-Dimensions-Daten</h3>
      <table>
        <thead><tr><th>BORIS-ID</th><th>Methode</th><th>Confidence</th><th>Dimensions ID</th></tr></thead>
        <tbody>
          {summary.results.slice(0, 8).map((result) => <tr key={result.source.borisId}><td>{result.source.borisId}</td><td>{result.method}</td><td>{(result.confidence * 100).toFixed(1)}%</td><td>{result.candidate?.id ?? "—"}</td></tr>)}
          {!summary.results.length && <tr><td colSpan={4}>Noch keine Importdaten für ein Matching vorhanden.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
