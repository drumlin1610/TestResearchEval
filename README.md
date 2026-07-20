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

Der aktuelle Prototyp speichert hochgeladene BORIS-Imports und den angelegten Auftrag zunächst im Browser-`localStorage`. Das reicht für eine erste UX-Validierung: Ein Reload verliert die Sichtung, den Auftrag und den Prozessstatus nicht sofort, ohne dass zusätzliche Infrastruktur nötig ist.

Für produktive Imports sollte diese Schicht serverseitig ersetzt werden:

- **DuckDB** eignet sich sehr gut für explorative Datenprofile, CSV/Parquet-Verarbeitung, lokale Batch-Jobs und reproduzierbare Zwischenstände pro Auftrag.
- **Postgres oder SQLite** sind sinnvoller, wenn mehrere Benutzer gleichzeitig Aufträge verwalten, Statusänderungen auditierbar sein müssen oder Review-Entscheide dauerhaft gespeichert werden.
- **Objekt-Storage plus Metadaten-Datenbank** ist die robusteste Variante für grosse BORIS-Exports: Originaldatei versioniert ablegen, Profiling-/Matching-Artefakte als Parquet/JSON speichern und nur Job-Metadaten relational verwalten.

Empfohlener nächster Schritt: eine kleine `ImportSessionRepository`-Schnittstelle einführen und die aktuelle Browser-Persistenz durch eine serverseitige Implementierung ersetzen. DuckDB kann dann als Analyse-Engine hinter dieser Schnittstelle genutzt werden, ohne die Oberfläche erneut umzubauen.
