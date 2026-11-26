import { NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  signUp,
} from "@/server/auth";
import { handleRouteError, jsonError, readJson } from "@/server/http";
import { validateCredentials } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/signup
 * Body: { email: string, password: string } (password: 8+ characters, max 72 bytes)
 * Creates the account (bcrypt hash), sets an httpOnly session cookie, returns { user }.
 */
export async function POST(request: Request) {
  const parsed = validateCredentials(await readJson(request), "signup");
  if (!parsed.ok) {
    return jsonError(400, parsed.error);
  }

  try {
    const { user, token } = await signUp(parsed.value);
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
    return response;
  } catch (error) {
    return handleRouteError(error, "POST /api/signup");
  }
}
