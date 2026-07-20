# Forschungsevaluation Dimensions Matcher

Next.js-Prototyp für die Forschungsevaluation: BORIS-Portal-Exporte werden über DOI, PubMed-ID und Titel gegen Dimensions-Publikationen gematcht. Die Kernlogik ist in `lib/dimensions-matching` gekapselt, damit sie später als wiederverwendbare Library oder npm-Package ausgelagert werden kann.

## Architektur

- `app/`: deutschsprachige Oberfläche mit Kennzahlen, Workflow und Demo-Resultaten.
- `lib/dimensions-matching/`: frameworkunabhängige Matching-Library mit Normalisierung, Confidence-Scoring, Summary-Metriken und BigQuery-Query-Builder.
- `test/`: Vitest-Spezifikation für die wichtigsten Matching-Regeln.

## Dimensions/GBQ Ansatz

Dimensions auf BigQuery ist ein subscription-only Dataset; die offizielle Dokumentation beschreibt zusätzlich eine Sandbox und Beispielqueries. Der Adapter in `bigquery.ts` injiziert deshalb nur einen generischen Query-Executor. So kann die Library mit `@google-cloud/bigquery`, serverseitigen APIs oder der Dimensions-Sandbox verbunden werden, ohne die Matching-Regeln an einen konkreten Client zu koppeln.

## Offene fachliche Entscheidungen

1. Welche BORIS-Spaltennamen sind im Export verbindlich?
2. Soll Titel-Matching rein deterministisch bleiben oder später durch Embeddings/LLM-Review ergänzt werden?
3. Welche Confidence-Schwellen sollen automatisch akzeptiert, manuell geprüft oder abgelehnt werden?
