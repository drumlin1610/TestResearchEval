import type { SourcePublication } from "@/lib/dimensions-matching";

export type ImportRow = Record<string, string>;
export type JobStatus = "draft" | "ready" | "running" | "completed";

export type ImportJob = {
  id: string;
  name: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  currentStep: string;
};

export type PersistedImportSession = {
  fileName: string;
  rows: ImportRow[];
  sources: SourcePublication[];
  job: ImportJob | null;
  savedAt: string;
};

export type ImportSessionRepository = {
  load(): PersistedImportSession | null;
  save(session: Omit<PersistedImportSession, "savedAt">): PersistedImportSession;
  clear(): void;
};
