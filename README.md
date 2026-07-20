# Forschungsevaluation Dimensions Matcher

Next.js-Prototyp für die Forschungsevaluation: BORIS-Portal-Exporte werden über DOI, PubMed-ID und Titel gegen Dimensions-Publikationen gematcht. Die Kernlogik ist in `lib/dimensions-matching` gekapselt, damit sie später als wiederverwendbare Library oder npm-Package ausgelagert werden kann.

## Architektur

- `app/`: deutschsprachige Oberfläche mit Kennzahlen, Workflow und Demo-Resultaten.
- `lib/dimensions-matching/`: frameworkunabhängige Matching-Library mit Normalisierung, Confidence-Scoring, Summary-Metriken und BigQuery-Query-Builder.
- `lib/import-workflow/`: Import-Schema für BORIS-Spalten, Import-Session-Typen und Persistenz-Repository für die Workbench.
- `test/`: Vitest-Spezifikation für die wichtigsten Matching-Regeln.

## BORIS-Import-Schema

Die Spalten, die aus einem BORIS-Export gelesen werden, sind zentral in `lib/import-workflow/boris-schema.ts` definiert. Dort werden fachliche Zielfelder, Pflichtfeld-Status und mögliche Spalten-Aliases gepflegt. Die Workbench zeigt nach dem Upload das erkannte Mapping an, damit fehlende oder anders benannte BORIS-Spalten sofort sichtbar werden.

## Dimensions/GBQ Ansatz

Dimensions auf BigQuery ist ein subscription-only Dataset; die offizielle Dokumentation beschreibt zusätzlich eine Sandbox und Beispielqueries. Der Adapter in `bigquery.ts` injiziert deshalb nur einen generischen Query-Executor. So kann die Library mit `@google-cloud/bigquery`, serverseitigen APIs oder der Dimensions-Sandbox verbunden werden, ohne die Matching-Regeln an einen konkreten Client zu koppeln.

## Offene fachliche Entscheidungen

1. Welche BORIS-Spaltennamen sind im Export verbindlich?
2. Soll Titel-Matching rein deterministisch bleiben oder später durch Embeddings/LLM-Review ergänzt werden?
3. Welche Confidence-Schwellen sollen automatisch akzeptiert, manuell geprüft oder abgelehnt werden?

## Persistenzstrategie für Imports

Der aktuelle Prototyp speichert hochgeladene BORIS-Imports und den angelegten Auftrag serverseitig in `data/research-eval.duckdb`. Die DuckDB-Schicht passt zum zweistufigen Workflow: Dimensions/GBQ-Jahresexporte der UniBE können als CSV-Snapshot geladen und danach lokal gegen BORIS-Exporte gematcht werden.

Die DuckDB-Anbindung nutzt den offiziellen Node.js Client `@duckdb/node-api`, sodass keine separate DuckDB-CLI im `PATH` benötigt wird. Die Route `POST /api/dimensions-snapshot` erwartet ein Multipart-Formular mit `file`, `year` und optional `snapshotId`. Der CSV-Import nutzt `read_csv_auto` und legt normalisierte Lookup-Spalten für DOI, PubMed-ID und Titel in `dimensions_publications` an. Erwartete CSV-Spalten sind `id`, `doi`, `pubmed_id`, `title` und `year`.

Für produktive Imports bleibt Objekt-Storage plus Metadaten-Datenbank sinnvoll, wenn Originaldateien versioniert abgelegt werden sollen. DuckDB übernimmt dabei die analytische Schicht für CSV/Parquet-Verarbeitung, lokale Batch-Jobs und reproduzierbare Zwischenstände pro Auftrag.
