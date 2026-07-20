import type { SourcePublication } from "@/lib/dimensions-matching";

export type ImportRow = Record<string, string>;
export type JobStatus = "draft" | "ready" | "running" | "completed";
export type WorkflowLogLevel = "info" | "success" | "warning" | "error";

export type WorkflowLogEntry = {
  id: string;
  at: string;
  level: WorkflowLogLevel;
  message: string;
  details?: string;
};

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
  workflowLog: WorkflowLogEntry[];
  savedAt: string;
};

export type ImportSessionDraft = Omit<PersistedImportSession, "savedAt">;

export type ImportSessionRepository = {
  load(): PersistedImportSession | null;
  save(session: ImportSessionDraft): PersistedImportSession;
  clear(): void;
};
