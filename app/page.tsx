import Link from "next/link";
import { DashboardShell } from "./dashboard-shell";
import { matchPublications } from "@/lib/dimensions-matching";

const demoSources = [
  { borisId: "BORIS-1001", doi: "https://doi.org/10.1000/demo.1", title: "Research evaluation with reliable metadata" },
  { borisId: "BORIS-1002", pubmedId: "PMID: 987654", title: "Biomedical impact analysis" },
  { borisId: "BORIS-1003", title: "An unmatched local publication" },
];

const demoCandidates = [
  { id: "pub.1", doi: "10.1000/demo.1", title: "Research evaluation with reliable metadata", year: 2024 },
  { id: "pub.2", pubmedId: "987654", title: "Biomedical impact analysis", year: 2023 },
];

export default function Home() {
  const summary = matchPublications(demoSources, demoCandidates);

  return (
    <DashboardShell>
      <header className="topbar" id="overview">
        <div>
          <p className="eyebrow dark">Free Next.js Admin Dashboard</p>
          <h1>Forschungsevaluation Dashboard</h1>
          <p>BORIS-Portal-Exporte und Dimensions/GBQ-Snapshots zentral laden, sichten und für das lokale DuckDB-Matching vorbereiten.</p>
        </div>
        <div className="topbar-pill">DuckDB · GBQ · BORIS</div>
      </header>

      <section className="stats-grid" aria-label="Kennzahlen">
        <article><span>Publikationen</span><strong>{summary.total}</strong><small>Demo-Datensatz</small></article>
        <article><span>Dimensions Matches</span><strong>{summary.matched}</strong><small>DOI/PMID/Titel</small></article>
        <article><span>Matchquote</span><strong>{(summary.matchRate * 100).toFixed(1)}%</strong><small>vorläufig</small></article>
        <article><span>Ø Zuverlässigkeit</span><strong>{(summary.averageConfidence * 100).toFixed(1)}%</strong><small>Confidence Score</small></article>
      </section>

      <section className="dashboard-grid page-link-grid">
        <article className="dashboard-card workflow-card">
          <p className="eyebrow dark">Workflow</p>
          <h2>Vorgeschlagener Ablauf</h2>
          <ol>
            <li>BORIS CSV/TSV mit BorisID, DOI, PubMed-ID und Titel importieren.</li>
            <li>Dimensions-Jahresdaten aus BigQuery als CSV exportieren.</li>
            <li>GBQ-Snapshot über die Dimensions-Seite in DuckDB laden.</li>
            <li>Deterministisches Matching mit Review für unsichere Treffer starten.</li>
          </ol>
        </article>
        <article className="dashboard-card">
          <p className="eyebrow dark">Einzelne Pages</p>
          <h2>Schritte separat starten</h2>
          <p className="muted">Die Hauptseite zeigt nur noch Übersicht und Einstiegspunkte. Jeder Arbeitsschritt ist als eigene Page erreichbar.</p>
          <div className="page-actions">
            <Link href="/boris-import">BORIS Import öffnen</Link>
            <Link href="/dimensions-import">Dimensions Import öffnen</Link>
            <Link href="/matching-demo">Matching Demo öffnen</Link>
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
