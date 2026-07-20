import { normalizeDoi, normalizePubmedId, normalizeTitle } from "./normalize";
import type { DimensionsPublication, SourcePublication } from "./types";

export type BigQueryMatchOptions = {
  dataset?: string;
  table?: string;
};

export type QueryExecutor = <Row>(query: string, params: Record<string, unknown>) => Promise<Row[]>;

export function buildDimensionsLookupQuery(dataset = "dimensions-ai.data", table = "publications"): string {
  return `
SELECT id, doi, pmid AS pubmedId, title.preferred AS title, year
FROM \`${dataset}.${table}\`
WHERE LOWER(doi) IN UNNEST(@dois)
   OR CAST(pmid AS STRING) IN UNNEST(@pubmedIds)
   OR LOWER(title.preferred) IN UNNEST(@titles)
LIMIT 10000`;
}

export async function fetchDimensionsCandidates(
  sources: SourcePublication[],
  executeQuery: QueryExecutor,
  options: BigQueryMatchOptions = {},
): Promise<DimensionsPublication[]> {
  const dataset = options.dataset ?? process.env.DIMENSIONS_GBQ_DATASET ?? "dimensions-ai.data";
  const table = options.table ?? process.env.DIMENSIONS_GBQ_PUBLICATIONS_TABLE ?? "publications";
  return executeQuery<DimensionsPublication>(buildDimensionsLookupQuery(dataset, table), {
    dois: sources.map((source) => normalizeDoi(source.doi)).filter(Boolean),
    pubmedIds: sources.map((source) => normalizePubmedId(source.pubmedId)).filter(Boolean),
    titles: sources.map((source) => normalizeTitle(source.title)).filter(Boolean),
  });
}
