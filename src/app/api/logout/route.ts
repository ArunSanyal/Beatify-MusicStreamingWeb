import { NextResponse } from "next/server";

import { SESSION_COOKIE, logOut, readSessionToken, sessionCookieOptions } from "@/server/auth";

export const dynamic = "force-dynamic";

/** POST /api/logout: deletes the session (best effort) and always clears the cookie. */
export async function POST(request: Request) {
  try {
    await logOut(readSessionToken(request));
  } catch (error) {
    // The cookie is cleared below either way; a leftover session row expires on its own.
    console.error("[POST /api/logout]", error);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
