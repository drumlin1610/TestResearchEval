"use client";

import { useState } from "react";

type ImportState = "idle" | "uploading" | "success" | "error";

type SnapshotResponse = {
  snapshotId: string;
  year: number;
  fileName: string;
  databasePath: string;
};

export function DimensionsImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [snapshotId, setSnapshotId] = useState("");
  const [state, setState] = useState<ImportState>("idle");
  const [message, setMessage] = useState("Noch kein Dimensions/GBQ CSV-Snapshot geladen.");
  const [response, setResponse] = useState<SnapshotResponse | null>(null);

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
        throw new Error(payload?.error ?? `Import fehlgeschlagen (${result.status}).`);
      }

      setResponse(payload as SnapshotResponse);
      setState("success");
      setMessage(`Snapshot ${payload.snapshotId} wurde erfolgreich importiert.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Dimensions-Import fehlgeschlagen.");
    }
  }

  const defaultSnapshotId = year && Number.isInteger(Number(year)) ? `dimensions-unibe-${year}` : "dimensions-unibe-YYYY";

  return (
    <section className="dashboard-card import-card" id="dimensions-import" aria-labelledby="dimensions-import-title">
      <div className="card-heading">
        <span className="icon-badge blue">GBQ</span>
        <div>
          <p className="eyebrow dark">Dimensions Import</p>
          <h2 id="dimensions-import-title">GBQ CSV-Snapshot in DuckDB laden</h2>
          <p>Exportiere Dimensions-Daten aus Google BigQuery als CSV und lade den Jahres-Snapshot direkt in die lokale DuckDB-Schicht.</p>
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
        <button type="button" onClick={importSnapshot} disabled={state === "uploading"}>{state === "uploading" ? "Import läuft…" : "Dimensions Snapshot importieren"}</button>
      </div>

      <div className={`status-banner status-${state}`} aria-live="polite">
        <strong>{state === "success" ? "Erfolg" : state === "error" ? "Fehler" : state === "uploading" ? "Verarbeitung" : "Bereit"}</strong>
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

      <div className="schema-list compact-schema">
        <strong>Erwartete CSV-Spalten</strong>
        <p className="muted">Der Import erwartet aktuell <code>id</code>, <code>doi</code>, <code>pubmed_id</code>, <code>title</code> und <code>year</code>. Weitere Spalten werden im Roh-Payload gespeichert.</p>
      </div>
    </section>
  );
}
