import { NextResponse } from "next/server";

import { getSessionUser, readSessionToken } from "@/server/auth";
import { handleRouteError } from "@/server/http";

export const dynamic = "force-dynamic";

/** GET /api/session: { user } for the session cookie, or { user: null } when signed out. */
export async function GET(request: Request) {
  const token = readSessionToken(request);
  if (!token) {
    return NextResponse.json({ user: null });
  }
  try {
    return NextResponse.json({ user: await getSessionUser(token) });
  } catch (error) {
    return handleRouteError(error, "GET /api/session");
  }
}
