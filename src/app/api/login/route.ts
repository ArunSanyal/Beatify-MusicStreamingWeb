import { NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  logIn,
  sessionCookieOptions,
} from "@/server/auth";
import { handleRouteError, jsonError, readJson } from "@/server/http";
import { validateCredentials } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/login
 * Body: { email: string, password: string }
 * Sets an httpOnly session cookie and returns { user }.
 */
export async function POST(request: Request) {
  const parsed = validateCredentials(await readJson(request), "login");
  if (!parsed.ok) {
    return jsonError(400, parsed.error);
  }

  try {
    const { user, token } = await logIn(parsed.value);
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
    return response;
  } catch (error) {
    return handleRouteError(error, "POST /api/login");
  }
}
