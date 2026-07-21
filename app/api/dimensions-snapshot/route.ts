import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDimensionsSnapshotStatistics, importDimensionsSnapshotFromCsv, importWorkflowDatabasePath } from "@/lib/import-workflow/server-duckdb-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const statistics = await getDimensionsSnapshotStatistics();

  return NextResponse.json({ databasePath: importWorkflowDatabasePath, statistics });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const yearValue = formData.get("year");
  const snapshotIdValue = formData.get("snapshotId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A Dimensions CSV file is required." }, { status: 400 });
  }

  const year = Number(yearValue);
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "A numeric snapshot year is required." }, { status: 400 });
  }

  const snapshotId = typeof snapshotIdValue === "string" && snapshotIdValue.trim()
    ? snapshotIdValue.trim()
    : `dimensions-unibe-${year}`;

  const tempDirectory = await mkdtemp(path.join(tmpdir(), "dimensions-snapshot-"));
  const csvPath = path.join(tempDirectory, file.name || `dimensions-${year}.csv`);

  try {
    await writeFile(csvPath, Buffer.from(await file.arrayBuffer()));
    await importDimensionsSnapshotFromCsv({ csvPath, snapshotId, year, fileName: file.name || path.basename(csvPath) });
    return NextResponse.json({ snapshotId, year, fileName: file.name, databasePath: importWorkflowDatabasePath });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
