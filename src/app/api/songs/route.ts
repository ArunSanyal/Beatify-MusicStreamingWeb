import { NextResponse } from "next/server";

import { handleRouteError, jsonError, readJson } from "@/server/http";
import { listSongs, saveSong } from "@/server/songs";
import { validateSaveSongRequest } from "@/lib/validation";

// Always run on request; never call AWS at build time.
export const dynamic = "force-dynamic";

/** GET /api/songs: all songs, newest first. */
export async function GET() {
  try {
    const songs = await listSongs();
    return NextResponse.json({ songs });
  } catch (error) {
    return handleRouteError(error, "GET /api/songs");
  }
}

/**
 * POST /api/songs
 * Body: { title: string, key: string } where key came from POST /api/upload.
 * Verifies the S3 object, then saves the song in DynamoDB.
 */
export async function POST(request: Request) {
  const parsed = validateSaveSongRequest(await readJson(request));
  if (!parsed.ok) {
    return jsonError(400, parsed.error);
  }

  try {
    const song = await saveSong(parsed.value);
    return NextResponse.json({ song }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "POST /api/songs");
  }
}
