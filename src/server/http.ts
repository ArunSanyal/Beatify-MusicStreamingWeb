import "server-only";

import { NextResponse } from "next/server";

import { AuthError } from "@/server/auth";
import { AwsNotConfiguredError } from "@/server/aws";
import { UploadRejectedError } from "@/server/songs";
import type { ApiError } from "@/lib/types";

export function jsonError(status: number, error: string) {
  return NextResponse.json<ApiError>({ error }, { status });
}

/** Reads a JSON body, returning `undefined` if it is missing or not valid JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Turns an error thrown by server code into a safe JSON response. */
export function handleRouteError(error: unknown, context: string) {
  if (error instanceof AwsNotConfiguredError) {
    return jsonError(503, "AWS is not configured. Set the AWS env vars and restart the server.");
  }
  if (error instanceof UploadRejectedError) {
    return jsonError(400, error.message);
  }
  if (error instanceof AuthError) {
    return jsonError(error.status, error.message);
  }
  console.error(`[${context}]`, error);
  return jsonError(500, "Something went wrong talking to AWS. Please try again.");
}
