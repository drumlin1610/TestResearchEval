import { NextResponse } from "next/server";
import { createDuckDbImportSessionRepository, importWorkflowDatabasePath } from "@/lib/import-workflow/server-duckdb-repository";
import type { ImportSessionDraft } from "@/lib/import-workflow/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const repository = await createDuckDbImportSessionRepository();
  const session = await repository.load();
  return NextResponse.json({ session, databasePath: importWorkflowDatabasePath });
}

export async function PUT(request: Request) {
  const repository = await createDuckDbImportSessionRepository();
  const sessionDraft = await request.json() as ImportSessionDraft;
  const session = await repository.save(sessionDraft);
  return NextResponse.json({ session, databasePath: importWorkflowDatabasePath });
}

export async function DELETE() {
  const repository = await createDuckDbImportSessionRepository();
  await repository.clear();
  return NextResponse.json({ ok: true, databasePath: importWorkflowDatabasePath });
}
