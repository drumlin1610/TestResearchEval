import { NextResponse } from "next/server";
import { matchPublications, type SourcePublication } from "@/lib/dimensions-matching";
import { getDimensionsMatchingCandidates, importWorkflowDatabasePath } from "@/lib/import-workflow/server-duckdb-repository";

export const dynamic = "force-dynamic";

type MatchingRunRequest = {
  sources?: SourcePublication[];
  snapshotId?: string;
  titleThreshold?: number;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as MatchingRunRequest;
    const sources = Array.isArray(body.sources) ? body.sources : [];
    const titleThreshold = typeof body.titleThreshold === "number" ? body.titleThreshold : undefined;
    const snapshotId = typeof body.snapshotId === "string" && body.snapshotId.trim() ? body.snapshotId.trim() : undefined;

    const candidates = await getDimensionsMatchingCandidates({ snapshotId });
    const summary = matchPublications(sources, candidates, titleThreshold);

    return NextResponse.json({
      summary,
      candidateCount: candidates.length,
      snapshotId: snapshotId ?? null,
      databasePath: importWorkflowDatabasePath,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Matching failed.", databasePath: importWorkflowDatabasePath },
      { status: 500 },
    );
  }
}
