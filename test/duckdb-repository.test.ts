import { describe, expect, it } from "vitest";
import { buildDimensionsSnapshotImportSql, buildDimensionsSnapshotInsertSql, buildDimensionsSnapshotStatisticsSql } from "../lib/import-workflow/server-duckdb-repository";

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
});
