import { NextResponse } from "next/server";
import { createSqliteImportSessionRepository, importWorkflowDatabasePath } from "@/lib/import-workflow/server-sqlite-repository";
import type { ImportSessionDraft } from "@/lib/import-workflow/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const repository = await createSqliteImportSessionRepository();
  const session = await repository.load();
  return NextResponse.json({ session, databasePath: importWorkflowDatabasePath });
}

export async function PUT(request: Request) {
  const repository = await createSqliteImportSessionRepository();
  const sessionDraft = await request.json() as ImportSessionDraft;
  const session = await repository.save(sessionDraft);
  return NextResponse.json({ session, databasePath: importWorkflowDatabasePath });
}

export async function DELETE() {
  const repository = await createSqliteImportSessionRepository();
  await repository.clear();
  return NextResponse.json({ ok: true, databasePath: importWorkflowDatabasePath });
}
