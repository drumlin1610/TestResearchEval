"use client";

import { useState } from "react";
import Papa from "papaparse";

type ImportState = "idle" | "uploading" | "success" | "error";

type SnapshotResponse = {
  snapshotId: string;
  year: number;
  fileName: string;
  databasePath: string;
  rowCount?: number;
  mode?: string;
};

type DimensionsRow = Record<string, string>;

type DirectCsvPreview = {
  columns: string[];
  rows: DimensionsRow[];
  rowCount: number;
};

const requiredColumnAliases = {
  id: ["id", "publication_id", "publicationId", "dimensions_id", "Dimensions ID", "Publication ID"],
  doi: ["doi", "DOI"],
  pubmed_id: ["pubmed_id", "pubmedId", "pmid", "PMID", "PubMed ID"],
  title: ["title", "Title"],
  year: ["year", "publication_year", "publicationYear", "Year", "Publication Year"],
} as const;

function missingRequiredDimensionsFields(columns: string[]) {
  return Object.entries(requiredColumnAliases)
    .filter(([, aliases]) => !aliases.some((alias) => columns.includes(alias)))
    .map(([field]) => field);
}

export function DimensionsImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [snapshotId, setSnapshotId] = useState("");
  const [state, setState] = useState<ImportState>("idle");
  const [message, setMessage] = useState("Noch kein Dimensions/GBQ CSV-Snapshot geladen.");
  const [response, setResponse] = useState<SnapshotResponse | null>(null);
  const [directPreview, setDirectPreview] = useState<DirectCsvPreview | null>(null);

  async function importSnapshot() {
    if (!file) {
      setState("error");
      setMessage("Bitte zuerst eine CSV-Datei auswählen.");
      return;
    }

    const numericYear = Number(year);
    if (!Number.isInteger(numericYear)) {
      setState("error");
      setMessage("Bitte ein numerisches Jahr erfassen, z. B. 2024.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("year", String(numericYear));
    if (snapshotId.trim()) formData.append("snapshotId", snapshotId.trim());

    setState("uploading");
    setResponse(null);
    setMessage("Upload läuft. Der Server importiert den CSV-Snapshot danach in DuckDB; bei großen Dateien kann das einige Minuten dauern.");

    try {
      const result = await fetch("/api/dimensions-snapshot", {
        method: "POST",
        body: formData,
      });
      const payload = await result.json().catch(() => null);

      if (!result.ok) {
        throw new Error(payload?.error ?? `Import fehlgeschlagen (${result.status}). Nutze alternativ den Direktmodus ohne DuckDB.`);
      }

      setResponse(payload as SnapshotResponse);
      setState("success");
      setMessage(`Snapshot ${payload.snapshotId} wurde erfolgreich importiert.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Dimensions-Import fehlgeschlagen. Nutze alternativ den Direktmodus ohne DuckDB.");
    }
  }

  function parseSelectedCsv() {
    return new Promise<DirectCsvPreview>((resolve, reject) => {
      if (!file) {
        reject(new Error("Bitte zuerst eine CSV-Datei auswählen."));
        return;
      }

      Papa.parse<DimensionsRow>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        complete: (result) => {
          const rows = result.data.filter((row) => Object.values(row).some(Boolean));
          const columns = result.meta.fields ?? Object.keys(rows[0] ?? {});
          resolve({ columns, rows, rowCount: rows.length });
        },
        error: (error) => reject(error),
      });
    });
  }

  async function previewCsvDirectly() {
    setState("uploading");
    setResponse(null);
    setDirectPreview(null);
    setMessage("CSV wird direkt im Browser gelesen. Es wird kein DuckDB-Import gestartet.");

    try {
      const parsed = await parseSelectedCsv();
      const missingColumns = missingRequiredDimensionsFields(parsed.columns);

      setDirectPreview({ ...parsed, rows: parsed.rows.slice(0, 5) });
      setState(missingColumns.length ? "error" : "success");
      setMessage(missingColumns.length
        ? `CSV wurde gelesen, aber diese Pflichtspalten fehlen: ${missingColumns.join(", ")}.`
        : `${parsed.rowCount} Dimensions-Zeilen direkt im Browser gelesen. Diese Variante braucht keinen DuckDB-Import.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "CSV konnte nicht gelesen werden.");
    }
  }

  async function saveWithInserts() {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear)) {
      setState("error");
      setMessage("Bitte ein numerisches Jahr erfassen, z. B. 2024.");
      return;
    }

    setState("uploading");
    setResponse(null);
    setMessage("CSV wird im Browser gelesen und danach zeilenweise per Insert-API gespeichert. DuckDB read_csv_auto wird dabei nicht verwendet.");

    try {
      const parsed = await parseSelectedCsv();
      const result = await fetch("/api/dimensions-snapshot/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: parsed.rows,
          year: numericYear,
          snapshotId: snapshotId.trim() || undefined,
          fileName: file?.name,
        }),
      });
      const payload = await result.json().catch(() => null);

      if (!result.ok) {
        throw new Error(payload?.error ?? `Insert-Import fehlgeschlagen (${result.status}).`);
      }

      setResponse(payload as SnapshotResponse);
      setDirectPreview({ ...parsed, rows: parsed.rows.slice(0, 5) });
      setState("success");
      setMessage(`${payload.rowCount ?? parsed.rowCount} Dimensions-Zeilen wurden per Insert-API gespeichert.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Insert-Import fehlgeschlagen.");
    }
  }

  const defaultSnapshotId = year && Number.isInteger(Number(year)) ? `dimensions-unibe-${year}` : "dimensions-unibe-YYYY";

  return (
    <section className="dashboard-card import-card" id="dimensions-import" aria-labelledby="dimensions-import-title">
      <div className="card-heading">
        <span className="icon-badge blue">GBQ</span>
        <div>
          <p className="eyebrow dark">Dimensions Import</p>
          <h2 id="dimensions-import-title">GBQ-Daten per Import, Inserts oder Direktmodus laden</h2>
          <p>Nutze wahlweise den DuckDB-CSV-Import, einen Insert-basierten Speicherweg ohne read_csv_auto oder den Direktmodus zur reinen Browserprüfung.</p>
        </div>
      </div>

      <div className="form-grid">
        <label>
          <span>Snapshot-Jahr</span>
          <input value={year} inputMode="numeric" onChange={(event) => setYear(event.target.value)} placeholder="2024" />
        </label>
        <label>
          <span>Snapshot-ID optional</span>
          <input value={snapshotId} onChange={(event) => setSnapshotId(event.target.value)} placeholder={defaultSnapshotId} />
        </label>
      </div>

      <label className="dropzone compact-dropzone">
        <span>Dimensions CSV auswählen</span>
        <strong>{file?.name ?? "CSV-Datei aus GBQ-Export laden"}</strong>
        <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>

      <div className="button-row">
        <button type="button" onClick={importSnapshot} disabled={state === "uploading"}>{state === "uploading" ? "Verarbeitung läuft…" : "CSV-Import"}</button>
        <button type="button" className="secondary" onClick={saveWithInserts} disabled={state === "uploading"}>{state === "uploading" ? "Bitte warten…" : "Per Inserts speichern"}</button>
        <button type="button" className="ghost" onClick={previewCsvDirectly} disabled={state === "uploading"}>{state === "uploading" ? "Bitte warten…" : "Ohne Import prüfen"}</button>
      </div>

      <div className={`status-banner status-${state}`} aria-live="polite">
        <strong>{state === "success" ? "Erfolg" : state === "error" ? "Hinweis" : state === "uploading" ? "Verarbeitung" : "Bereit"}</strong>
        <span>{message}</span>
      </div>

      {response && (
        <dl className="snapshot-result">
          <div><dt>Snapshot-ID</dt><dd>{response.snapshotId}</dd></div>
          <div><dt>Jahr</dt><dd>{response.year}</dd></div>
          <div><dt>Datei</dt><dd>{response.fileName}</dd></div>
          <div><dt>DuckDB</dt><dd>{response.databasePath}</dd></div>
          {response.rowCount !== undefined && <div><dt>Zeilen</dt><dd>{response.rowCount}</dd></div>}
          {response.mode && <div><dt>Modus</dt><dd>{response.mode}</dd></div>}
        </dl>
      )}

      {directPreview && (
        <div className="direct-preview">
          <div className="direct-preview-header">
            <strong>Direktmodus-Vorschau</strong>
            <span>{directPreview.rowCount} Zeilen · {directPreview.columns.length} Spalten</span>
          </div>
          <p className="muted"><strong>Erkannte Spalten:</strong> {directPreview.columns.join(", ")}</p>
          <div className="data-grid direct-preview-grid" role="region" aria-label="Dimensions CSV Direktvorschau" tabIndex={0}>
            <table>
              <thead>
                <tr>{directPreview.columns.slice(0, 6).map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {directPreview.rows.map((row, rowIndex) => (
                  <tr key={`dimensions-${rowIndex}`}>
                    {directPreview.columns.slice(0, 6).map((column) => <td key={`${rowIndex}-${column}`}>{row[column] || "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="schema-list compact-schema">
        <strong>Mögliche Wege</strong>
        <ul>
          <li><span>Persistenter Import</span><code>DuckDB-Tabelle</code></li>
          <li><span>Insert-Import</span><code>JSON-Zeilen per API</code></li>
          <li><span>Direktmodus</span><code>Browser-CSV ohne Server</code></li>
          <li><span>Große Exporte</span><code>Parquet statt CSV empfohlen</code></li>
        </ul>
        <p className="muted">Für den DuckDB-Import werden <code>id</code>, <code>doi</code>, <code>pubmed_id</code>, <code>title</code> und <code>year</code> erwartet; gängige Dimensions-Aliases wie <code>Publication ID</code>, <code>PubMed ID</code> und <code>Publication Year</code> werden ebenfalls akzeptiert.</p>
      </div>
    </section>
  );
}
