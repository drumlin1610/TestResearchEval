import { describe, expect, it } from "vitest";
import { matchPublications, normalizeDoi, normalizePubmedId } from "../lib/dimensions-matching";

describe("dimensions matching library", () => {
  it("normalizes DOI and PubMed identifiers", () => {
    expect(normalizeDoi("https://doi.org/10.123/ABC")).toBe("10.123/abc");
    expect(normalizePubmedId("PMID: 123 456")).toBe("123456");
  });

  it("prioritizes exact DOI matches and reports summary metrics", () => {
    const summary = matchPublications(
      [{ borisId: "B1", doi: "doi:10.1/Case", title: "A title" }, { borisId: "B2", title: "Missing" }],
      [{ id: "pub.1", doi: "10.1/case", title: "A title" }],
    );

    expect(summary.matched).toBe(1);
    expect(summary.unmatched).toBe(1);
    expect(summary.byMethod.doi).toBe(1);
    expect(summary.results[0].confidence).toBe(1);
  });
});
