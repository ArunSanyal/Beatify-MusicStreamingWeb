import { NextResponse } from "next/server";

import { handleRouteError, jsonError, readJson } from "@/server/http";
import { createUploadUrl } from "@/server/songs";
import { validateUploadRequest } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/upload
 * Body: { title: string, contentType: "audio/mpeg", size: number }
 * Returns a 60-second presigned S3 PUT URL and the object key.
 */
export async function POST(request: Request) {
  const parsed = validateUploadRequest(await readJson(request));
  if (!parsed.ok) {
    return jsonError(400, parsed.error);
  }

  try {
    const result = await createUploadUrl(parsed.value);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "POST /api/upload");
  }
}
