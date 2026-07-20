import { NextResponse } from "next/server";
import { importDimensionsSnapshotFromRows, importWorkflowDatabasePath, type DimensionsSnapshotRow } from "@/lib/import-workflow/server-duckdb-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    rows?: DimensionsSnapshotRow[];
    year?: number;
    snapshotId?: string;
    fileName?: string;
  } | null;

  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "A rows array is required." }, { status: 400 });
  }

  const year = Number(body.year);
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "A numeric snapshot year is required." }, { status: 400 });
  }

  const snapshotId = typeof body.snapshotId === "string" && body.snapshotId.trim()
    ? body.snapshotId.trim()
    : `dimensions-unibe-${year}`;
  const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : `dimensions-${year}.json`;

  console.info("[dimensions:insert-api] Request accepted", { snapshotId, year, fileName, rows: body.rows.length });
  const rowCount = await importDimensionsSnapshotFromRows({ snapshotId, year, fileName, rows: body.rows });
  console.info("[dimensions:insert-api] Request completed", { snapshotId, year, fileName, rowCount });
  return NextResponse.json({ snapshotId, year, fileName, rowCount, databasePath: importWorkflowDatabasePath, mode: "insert" });
}
