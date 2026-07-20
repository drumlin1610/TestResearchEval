import { describe, expect, it } from "vitest";
import { fetchDimensionsCandidates } from "../lib/dimensions-matching";

describe("dimensions BigQuery adapter", () => {
  it("normalizes BORIS identifiers before passing query parameters", async () => {
    const calls: Record<string, unknown>[] = [];
    await fetchDimensionsCandidates(
      [{ borisId: "B1", doi: "https://doi.org/10.123/ABC", pubmedId: "PMID: 12 34", title: "Über Evaluation!" }],
      async (_query, params) => {
        calls.push(params);
        return [];
      },
    );

    expect(calls[0]).toMatchObject({
      dois: ["10.123/abc"],
      pubmedIds: ["1234"],
      titles: ["uber evaluation"],
    });
  });
});
