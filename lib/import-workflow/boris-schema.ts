import type { SourcePublication } from "../dimensions-matching";
import type { ImportRow } from "./types";

export type BorisField = "borisId" | "doi" | "pubmedId" | "title" | "year";

export type BorisFieldDefinition = {
  field: BorisField;
  label: string;
  required: boolean;
  aliases: string[];
};

export type BorisColumnMapping = Partial<Record<BorisField, string>>;

export const borisFieldDefinitions: BorisFieldDefinition[] = [
  {
    field: "borisId",
    label: "BORIS-ID",
    required: true,
    aliases: ["uuid","borisid", "boris_id", "id", "recordid", "record_id", "publicationid", "publication_id"],
  },
  {
    field: "doi",
    label: "DOI",
    required: false,
    aliases: ["publisherDOI","doi", "digitalobjectidentifier"],
  },
  {
    field: "pubmedId",
    label: "PubMed-ID",
    required: false,
    aliases: ["pubmedid", "pubmed_id", "pmid", "pubmed"],
  },
  {
    field: "title",
    label: "Titel",
    required: true,
    aliases: ["title", "titel", "publicationtitle", "publication_title"],
  },
  {
    field: "year",
    label: "Publikationsjahr",
    required: false,
    aliases: ["year", "jahr", "publicationyear", "publication_year","year_of_publication"],
  },
];

export function normalizeBorisHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function detectBorisColumns(headers: string[]): BorisColumnMapping {
  const normalizedHeaders = new Map(headers.map((header) => [normalizeBorisHeader(header), header]));

  return borisFieldDefinitions.reduce<BorisColumnMapping>((mapping, definition) => {
    const column = definition.aliases
      .map((alias) => normalizedHeaders.get(normalizeBorisHeader(alias)))
      .find(Boolean);

    if (column) mapping[definition.field] = column;
    return mapping;
  }, {});
}

export function getMissingRequiredBorisFields(mapping: BorisColumnMapping) {
  return borisFieldDefinitions
    .filter((definition) => definition.required && !mapping[definition.field])
    .map((definition) => definition.label);
}

export function mapRowsToBorisPublications(rows: ImportRow[]): SourcePublication[] {
  const mapping = detectBorisColumns(Object.keys(rows[0] ?? {}));

  return rows.map((row, index) => ({
    borisId: row[mapping.borisId ?? ""] || `BORIS-IMPORT-${index + 1}`,
    doi: mapping.doi ? row[mapping.doi] : undefined,
    pubmedId: mapping.pubmedId ? row[mapping.pubmedId] : undefined,
    title: mapping.title ? row[mapping.title] : undefined,
    year: mapping.year && row[mapping.year] ? Number(row[mapping.year]) : undefined,
  }));
}
