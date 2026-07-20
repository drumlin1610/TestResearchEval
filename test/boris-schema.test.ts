import { describe, expect, it } from "vitest";
import { detectBorisColumns, getMissingRequiredBorisFields, mapRowsToBorisPublications } from "../lib/import-workflow/boris-schema";

describe("BORIS import schema", () => {
  it("detects supported BORIS export column aliases", () => {
    expect(detectBorisColumns(["Publication ID", "Digital Object Identifier", "PMID", "Titel", "Jahr"])).toMatchObject({
      borisId: "Publication ID",
      doi: "Digital Object Identifier",
      pubmedId: "PMID",
      title: "Titel",
      year: "Jahr",
    });
  });

  it("maps rows into source publications and reports missing required fields", () => {
    const mapping = detectBorisColumns(["DOI"]);
    expect(getMissingRequiredBorisFields(mapping)).toEqual(["BORIS-ID", "Titel"]);

    expect(mapRowsToBorisPublications([{ "Publication ID": "B1", DOI: "10.1/demo", Titel: "Ein Titel" }])).toEqual([
      { borisId: "B1", doi: "10.1/demo", pubmedId: undefined, title: "Ein Titel", year: undefined },
    ]);
  });
});
