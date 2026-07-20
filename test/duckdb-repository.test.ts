import { describe, expect, it } from "vitest";
import { buildDimensionsSnapshotImportSql } from "../lib/import-workflow/server-duckdb-repository";

describe("DuckDB import workflow repository", () => {
  it("builds a Dimensions CSV snapshot import with normalized lookup columns", () => {
    const sql = buildDimensionsSnapshotImportSql();

    expect(sql).toContain("read_csv_auto($csvPath");
    expect(sql).toContain("INSERT INTO dimensions_snapshots");
    expect(sql).toContain("normalized_doi");
    expect(sql).toContain("normalized_pubmed_id");
    expect(sql).toContain("normalized_title");
    expect(sql).toContain("$snapshotId");
  });
});
