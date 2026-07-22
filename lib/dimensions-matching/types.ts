export type SourcePublication = {
  borisId: string;
  doi?: string;
  pubmedId?: string;
  title?: string;
  year?: number;
  publicationType?: string;
  publicationSubtype?: string;
};

export type DimensionsPublication = {
  id: string;
  doi?: string;
  pubmedId?: string;
  title?: string;
  year?: number;
};

export type MatchMethod = "doi" | "pubmedId" | "title" | "unmatched";

export type PublicationMatch = {
  source: SourcePublication;
  candidate?: DimensionsPublication;
  method: MatchMethod;
  confidence: number;
  reasons: string[];
};

export type MatchSummary = {
  total: number;
  matched: number;
  unmatched: number;
  matchRate: number;
  averageConfidence: number;
  byMethod: Record<MatchMethod, number>;
  results: PublicationMatch[];
};
