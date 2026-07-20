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
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Forschungsevaluation</p>
        <h1>BORIS-Portal-Exporte mit Dimensions auf Google BigQuery matchen</h1>
        <p>
          Ein Next.js-Prototyp für Import, Matching und Qualitätssicherung. Die Matching-Logik liegt bewusst in
          <code> lib/dimensions-matching</code>, damit sie später als eigenständige Library wiederverwendet werden kann.
        </p>
      </section>

      <section className="cards" aria-label="Kennzahlen">
        <article><strong>{summary.total}</strong><span>Publikationen</span></article>
        <article><strong>{summary.matched}</strong><span>Dimensions Matches</span></article>
        <article><strong>{(summary.matchRate * 100).toFixed(1)}%</strong><span>Matchquote</span></article>
        <article><strong>{(summary.averageConfidence * 100).toFixed(1)}%</strong><span>Ø Zuverlässigkeit</span></article>
      </section>

      <section className="panel">
        <h2>Vorgeschlagener Workflow</h2>
        <ol>
          <li>BORIS CSV/XLSX mit BorisID, DOI, PubMed-ID und Titel importieren.</li>
          <li>Dimensions-Kandidaten via GBQ Publications-Tabelle nach DOI, PMID und Titel laden.</li>
          <li>Deterministisches Matching nach DOI/PubMed-ID, danach Titel-Fallback mit Confidence Score.</li>
          <li>Review-Ansicht für unsichere Treffer und Export der Matchquote für die Evaluation.</li>
        </ol>
      </section>

      <section className="panel">
        <h2>Demo-Ergebnis</h2>
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
    </main>
  );
}
