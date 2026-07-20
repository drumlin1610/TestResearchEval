import { DimensionsImportPanel } from "./dimensions-import-panel";
import { ImportWorkbench } from "./import-workbench";
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
    <main className="admin-shell">
      <aside className="sidebar" aria-label="Dashboard Navigation">
        <div className="brand-mark"><span>FE</span><strong>Research Eval</strong></div>
        <nav>
          <a href="#overview" className="active">Dashboard</a>
          <a href="#boris-import">BORIS Import</a>
          <a href="#dimensions-import">Dimensions Import</a>
          <a href="#matching-demo">Matching Demo</a>
        </nav>
      </aside>

      <div className="dashboard-main">
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

        <section className="dashboard-grid">
          <article className="dashboard-card workflow-card">
            <p className="eyebrow dark">Workflow</p>
            <h2>Vorgeschlagener Ablauf</h2>
            <ol>
              <li>BORIS CSV/TSV mit BorisID, DOI, PubMed-ID und Titel importieren.</li>
              <li>Dimensions-Jahresdaten aus BigQuery als CSV exportieren.</li>
              <li>GBQ-Snapshot über die Dimensions-Fläche in DuckDB laden.</li>
              <li>Deterministisches Matching mit Review für unsichere Treffer starten.</li>
            </ol>
          </article>
          <DimensionsImportPanel />
        </section>

        <ImportWorkbench />

        <section className="dashboard-card" id="matching-demo">
          <div className="card-heading">
            <span className="icon-badge green">QA</span>
            <div>
              <p className="eyebrow dark">Matching Demo</p>
              <h2>Demo-Ergebnis</h2>
            </div>
          </div>
          <table>
            <thead><tr><th>BorisID</th><th>Methode</th><th>Confidence</th><th>Dimensions ID</th></tr></thead>
            <tbody>
              {summary.results.map((result) => (
                <tr key={result.source.borisId}>
                  <td>{result.source.borisId}</td>
                  <td>{result.method}</td>
                  <td>{(result.confidence * 100).toFixed(1)}%</td>
                  <td>{result.candidate?.id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
