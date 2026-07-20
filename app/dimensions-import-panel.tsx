"use client";

import { useState } from "react";
import Papa from "papaparse";

type ImportState = "idle" | "uploading" | "success" | "error";

type SnapshotResponse = {
  snapshotId: string;
  year: number;
  fileName: string;
  databasePath: string;
};

type DimensionsRow = Record<string, string>;

type DirectCsvPreview = {
  columns: string[];
  rows: DimensionsRow[];
  rowCount: number;
};

const requiredColumns = ["id", "doi", "pubmed_id", "title", "year"];

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

  function previewCsvDirectly() {
    if (!file) {
      setState("error");
      setMessage("Bitte zuerst eine CSV-Datei auswählen.");
      return;
    }

    setState("uploading");
    setResponse(null);
    setDirectPreview(null);
    setMessage("CSV wird direkt im Browser gelesen. Es wird kein DuckDB-Import gestartet.");

    Papa.parse<DimensionsRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        const rows = result.data.filter((row) => Object.values(row).some(Boolean));
        const columns = result.meta.fields ?? Object.keys(rows[0] ?? {});
        const missingColumns = requiredColumns.filter((column) => !columns.includes(column));

        setDirectPreview({ columns, rows: rows.slice(0, 5), rowCount: rows.length });
        setState(missingColumns.length ? "error" : "success");
        setMessage(missingColumns.length
          ? `CSV wurde gelesen, aber diese Pflichtspalten fehlen: ${missingColumns.join(", ")}.`
          : `${rows.length} Dimensions-Zeilen direkt im Browser gelesen. Diese Variante braucht keinen DuckDB-Import.`);
      },
      error: (error) => {
        setState("error");
        setMessage(`CSV konnte nicht gelesen werden: ${error.message}`);
      },
    });
  }

  const defaultSnapshotId = year && Number.isInteger(Number(year)) ? `dimensions-unibe-${year}` : "dimensions-unibe-YYYY";

  return (
    <section className="dashboard-card import-card" id="dimensions-import" aria-labelledby="dimensions-import-title">
      <div className="card-heading">
        <span className="icon-badge blue">GBQ</span>
        <div>
          <p className="eyebrow dark">Dimensions Import</p>
          <h2 id="dimensions-import-title">GBQ CSV-Snapshot laden oder direkt prüfen</h2>
          <p>Nutze wahlweise den DuckDB-Import für persistente Snapshots oder den Direktmodus, wenn du eine CSV ohne Serverimport prüfen möchtest.</p>
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
        <button type="button" onClick={importSnapshot} disabled={state === "uploading"}>{state === "uploading" ? "Verarbeitung läuft…" : "In DuckDB importieren"}</button>
        <button type="button" className="secondary" onClick={previewCsvDirectly} disabled={state === "uploading"}>{state === "uploading" ? "Bitte warten…" : "Ohne Import prüfen"}</button>
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
          <li><span>Direktmodus</span><code>Browser-CSV ohne Server</code></li>
          <li><span>Große Exporte</span><code>Parquet statt CSV empfohlen</code></li>
        </ul>
        <p className="muted">Für den DuckDB-Import werden aktuell <code>id</code>, <code>doi</code>, <code>pubmed_id</code>, <code>title</code> und <code>year</code> erwartet.</p>
      </div>
    </section>
  );
}
