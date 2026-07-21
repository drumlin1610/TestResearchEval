import { DashboardShell } from "../dashboard-shell";
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

export default function MatchingDemoPage() {
  const summary = matchPublications(demoSources, demoCandidates);

  return (
    <DashboardShell>
      <section className="dashboard-card" id="matching-demo">
        <div className="card-heading">
          <span className="icon-badge green">QA</span>
          <div>
            <p className="eyebrow dark">Matching Demo</p>
            <h1>Demo-Ergebnis</h1>
            <p>Diese separate Page zeigt das deterministische Demo-Matching für DOI, PMID und Titel.</p>
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
    </DashboardShell>
  );
}
