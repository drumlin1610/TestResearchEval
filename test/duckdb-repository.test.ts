import { describe, expect, it } from "vitest";
import { buildDimensionsMatchingCandidateParams, buildDimensionsMatchingCandidatesSql, buildDimensionsSnapshotImportSql, buildDimensionsSnapshotInsertSql, buildDimensionsSnapshotStatisticsSql } from "../lib/import-workflow/server-duckdb-repository";

describe("DuckDB import workflow repository", () => {
  it("builds a Dimensions CSV snapshot import with normalized lookup columns", () => {
    const sql = buildDimensionsSnapshotImportSql();

    expect(sql).toContain("read_csv_auto($csvPath");
    expect(sql).toContain("to_json(csv_row) AS raw_json");
    expect(sql).toContain("json_extract_string(raw_json, '$.\"Publication ID\"')");
    expect(sql).toContain("json_extract_string(raw_json, '$.\"PubMed ID\"')");
    expect(sql).toContain("INSERT INTO dimensions_snapshots");
    expect(sql).toContain("normalized_doi");
    expect(sql).toContain("normalized_pubmed_id");
    expect(sql).toContain("normalized_title");
    expect(sql).toContain("$snapshotId");
  });

  it("builds a Dimensions row insert without using DuckDB CSV loading", () => {
    const sql = buildDimensionsSnapshotInsertSql();

    expect(sql).toContain("INSERT INTO dimensions_publications");
    expect(sql).not.toContain("read_csv_auto");
    expect(sql).toContain("$rawPayload::JSON");
    expect(sql).toContain("normalized_doi");
  });

  it("builds Dimensions KPI statistics queries", () => {
    const { summarySql, yearSql } = buildDimensionsSnapshotStatisticsSql();

    expect(summarySql).toContain("count(*) AS total_publications");
    expect(summarySql).toContain("with_pubmed_id_count");
    expect(summarySql).toContain("with_doi_count");
    expect(yearSql).toContain("GROUP BY year");
    expect(yearSql).toContain("ORDER BY year DESC NULLS LAST");
  });

  it("builds a Dimensions matching candidate query for active snapshots", () => {
    const sql = buildDimensionsMatchingCandidatesSql({ snapshotId: "dimensions-unibe-2024" });

    expect(sql).toContain("FROM dimensions_publications publication");
    expect(sql).toContain("INNER JOIN dimensions_snapshots snapshot");
    expect(sql).toContain("snapshot.status = 'active'");
    expect(sql).toContain("publication.snapshot_id = $snapshotId");
    expect(sql).toContain("LIMIT $limit");
  });

  it("does not bind an unused snapshot parameter for all active snapshots", () => {
    const sql = buildDimensionsMatchingCandidatesSql();
    const params = buildDimensionsMatchingCandidateParams();

    expect(sql).not.toContain("$snapshotId");
    expect(params).toEqual({ limit: 50_000 });
  });
});
