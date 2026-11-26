// Browser-side helpers for calling this app's API routes. No AWS code here.
import type { SessionUser, Song } from "@/lib/types";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const NOT_CONFIGURED_MESSAGE =
  "Beatify isn't connected to AWS yet, so songs and accounts aren't available right now.";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiRequestError("Network error. Check your connection and try again.", 0);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 503) {
      throw new ApiRequestError(NOT_CONFIGURED_MESSAGE, 503);
    }
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status}).`;
    throw new ApiRequestError(message, response.status);
  }

  return body as T;
}

function postJson<T>(url: string, data: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function fetchSongs(): Promise<Song[]> {
  const { songs } = await request<{ songs: Song[] }>("/api/songs", { cache: "no-store" });
  return songs;
}

/** Full upload: get a presigned URL, PUT the file to S3, then save the song. */
export async function uploadSong(title: string, file: File): Promise<Song> {
  const { uploadUrl, key } = await postJson<{ uploadUrl: string; key: string }>(
    "/api/upload",
    { title, contentType: file.type, size: file.size },
  );

  let s3Response: Response;
  try {
    s3Response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
  } catch {
    throw new ApiRequestError(
      "Could not reach storage. Check your connection (or the S3 CORS settings).",
      0,
    );
  }
  if (!s3Response.ok) {
    throw new ApiRequestError(`File upload failed (${s3Response.status}).`, s3Response.status);
  }

  const { song } = await postJson<{ song: Song }>("/api/songs", { title, key });
  return song;
}

export type AuthMode = "login" | "signup";

/** POST /api/login or /api/signup. The session cookie is set by the server (httpOnly). */
export async function authenticate(
  mode: AuthMode,
  email: string,
  password: string,
): Promise<SessionUser> {
  const { user } = await postJson<{ user: SessionUser }>(`/api/${mode}`, { email, password });
  return user;
}

export async function fetchSession(): Promise<SessionUser | null> {
  const { user } = await request<{ user: SessionUser | null }>("/api/session", {
    cache: "no-store",
  });
  return user;
}

export async function logout(): Promise<void> {
  await request<{ ok: true }>("/api/logout", { method: "POST" });
}
