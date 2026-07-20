export function normalizeDoi(value?: string): string | undefined {
  const clean = value?.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");
  return clean || undefined;
}

export function normalizePubmedId(value?: string): string | undefined {
  const clean = value?.trim().replace(/^pmid:\s*/i, "").replace(/\D/g, "");
  return clean || undefined;
}

export function normalizeTitle(value?: string): string | undefined {
  const clean = value
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return clean || undefined;
}
