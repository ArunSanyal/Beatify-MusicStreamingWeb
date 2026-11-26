// Shared validation helpers. Safe to import from both client and server code:
// nothing here touches AWS or secrets.

export const MAX_TITLE_LENGTH = 100;
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const ALLOWED_CONTENT_TYPE = "audio/mpeg";
export const S3_KEY_PREFIX = "songs/";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const S3_KEY_REGEX = new RegExp(`^songs/${UUID_PATTERN}-[a-z0-9-]{1,60}\\.mp3$`);

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Trims a title and checks it is non-empty and within the length limit. */
export function validateTitle(input: unknown): ValidationResult<string> {
  if (typeof input !== "string") {
    return { ok: false, error: "Title is required." };
  }
  const title = input.trim();
  if (title.length === 0) {
    return { ok: false, error: "Title is required." };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return {
      ok: false,
      error: `Title must be at most ${MAX_TITLE_LENGTH} characters.`,
    };
  }
  return { ok: true, value: title };
}

/**
 * Turns a title into a lowercase, URL- and S3-safe slug (a-z, 0-9, hyphens).
 * Falls back to "song" if nothing usable is left.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "song";
}

/** Builds the S3 object key from a generated id and the title's slug. */
export function buildS3Key(id: string, title: string): string {
  return `${S3_KEY_PREFIX}${id}-${slugify(title)}.mp3`;
}

/** True if `key` looks exactly like a key produced by `buildS3Key`. */
export function isValidS3Key(key: unknown): key is string {
  return typeof key === "string" && S3_KEY_REGEX.test(key);
}

export type UploadRequest = {
  title: string;
  contentType: typeof ALLOWED_CONTENT_TYPE;
  size: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates the JSON body of `POST /api/upload`. */
export function validateUploadRequest(
  body: unknown,
): ValidationResult<UploadRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const title = validateTitle(body.title);
  if (!title.ok) return title;

  if (body.contentType !== ALLOWED_CONTENT_TYPE) {
    return { ok: false, error: "Only MP3 files (audio/mpeg) are allowed." };
  }

  const size = body.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
    return { ok: false, error: "File size must be a positive whole number." };
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: "File must be 15 MB or smaller." };
  }

  return {
    ok: true,
    value: { title: title.value, contentType: ALLOWED_CONTENT_TYPE, size },
  };
}

export type SaveSongRequest = {
  title: string;
  key: string;
};

/** Validates the JSON body of `POST /api/songs`. */
export function validateSaveSongRequest(
  body: unknown,
): ValidationResult<SaveSongRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const title = validateTitle(body.title);
  if (!title.ok) return title;

  if (!isValidS3Key(body.key)) {
    return { ok: false, error: "Invalid upload key." };
  }

  return { ok: true, value: { title: title.value, key: body.key } };
}

/** Client-side check of a picked file before asking for an upload URL. */
export function validateFile(
  file: { type: string; size: number } | null,
): ValidationResult<true> {
  if (!file) return { ok: false, error: "Please choose an MP3 file." };
  if (file.type !== ALLOWED_CONTENT_TYPE) {
    return { ok: false, error: "Only MP3 files (audio/mpeg) are allowed." };
  }
  if (file.size <= 0) return { ok: false, error: "The file is empty." };
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: "File must be 15 MB or smaller." };
  }
  return { ok: true, value: true };
}

// ---------------------------------------------------------------------------
// Login / signup
// ---------------------------------------------------------------------------

export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt only uses the first 72 bytes of a password, so longer ones are rejected. */
export const MAX_PASSWORD_BYTES = 72;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Credentials = { email: string; password: string };

/** Trims and lowercases an email and checks its shape and length. */
export function validateEmail(input: unknown): ValidationResult<string> {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, error: "Email is required." };
  }
  const email = input.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true, value: email };
}

/**
 * Checks a password. Signup enforces the minimum length; login only checks that
 * a password was given (so older, shorter passwords are not locked out by UI rules).
 */
export function validatePassword(
  input: unknown,
  mode: "login" | "signup",
): ValidationResult<string> {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, error: "Password is required." };
  }
  if (new TextEncoder().encode(input).length > MAX_PASSWORD_BYTES) {
    return { ok: false, error: `Password must be at most ${MAX_PASSWORD_BYTES} bytes.` };
  }
  if (mode === "signup" && input.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return { ok: true, value: input };
}

/** Validates the JSON body of `POST /api/login` and `POST /api/signup`. */
export function validateCredentials(
  body: unknown,
  mode: "login" | "signup",
): ValidationResult<Credentials> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const email = validateEmail(body.email);
  if (!email.ok) return email;
  const password = validatePassword(body.password, mode);
  if (!password.ok) return password;
  return { ok: true, value: { email: email.value, password: password.value } };
}
