import { normalizeDoi, normalizePubmedId, normalizeTitle } from "./normalize";
import type { DimensionsPublication, MatchSummary, PublicationMatch, SourcePublication } from "./types";

function scoreTitle(a?: string, b?: string): number {
  const left = new Set((normalizeTitle(a) ?? "").split(" ").filter(Boolean));
  const right = new Set((normalizeTitle(b) ?? "").split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function indexBy(candidates: DimensionsPublication[], getKey: (candidate: DimensionsPublication) => string | undefined) {
  const index = new Map<string, DimensionsPublication>();
  candidates.forEach((candidate) => {
    const key = getKey(candidate);
    if (key) index.set(key, candidate);
  });
  return index;
}

export function matchPublications(
  sources: SourcePublication[],
  candidates: DimensionsPublication[],
  titleThreshold = 0.86,
): MatchSummary {
  const byDoi = indexBy(candidates, (item) => normalizeDoi(item.doi));
  const byPubmed = indexBy(candidates, (item) => normalizePubmedId(item.pubmedId));

  const results: PublicationMatch[] = sources.map((source) => {
    const doi = normalizeDoi(source.doi);
    if (doi && byDoi.has(doi)) {
      return { source, candidate: byDoi.get(doi), method: "doi", confidence: 1, reasons: ["DOI exakt normalisiert gefunden"] };
    }

    const pubmedId = normalizePubmedId(source.pubmedId);
    if (pubmedId && byPubmed.has(pubmedId)) {
      return { source, candidate: byPubmed.get(pubmedId), method: "pubmedId", confidence: 0.98, reasons: ["PubMed-ID exakt normalisiert gefunden"] };
    }

    const ranked = candidates
      .map((candidate) => ({ candidate, confidence: scoreTitle(source.title, candidate.title) }))
      .sort((a, b) => b.confidence - a.confidence);
    const best = ranked[0];
    if (best && best.confidence >= titleThreshold) {
      return {
        source,
        candidate: best.candidate,
        method: "title",
        confidence: Number(best.confidence.toFixed(3)),
        reasons: [`Titelähnlichkeit über Schwelle ${titleThreshold}`],
      };
    }

    return { source, method: "unmatched", confidence: 0, reasons: ["Kein zuverlässiger Dimensions-Kandidat"] };
  });

  const matched = results.filter((result) => result.method !== "unmatched").length;
  const byMethod = { doi: 0, pubmedId: 0, title: 0, unmatched: 0 };
  results.forEach((result) => {
    byMethod[result.method] += 1;
  });

  return {
    total: sources.length,
    matched,
    unmatched: sources.length - matched,
    matchRate: sources.length ? matched / sources.length : 0,
    averageConfidence: matched ? results.reduce((sum, result) => sum + result.confidence, 0) / matched : 0,
    byMethod,
    results,
  };
}
