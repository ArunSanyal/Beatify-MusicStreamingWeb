import "server-only";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { getClients, getUsersConfig } from "@/server/aws";
import type { SessionUser } from "@/lib/types";
import type { Credentials } from "@/lib/validation";

/*
 * Users and sessions both live in the DYNAMODB_USERS_TABLE table, which has a
 * single string partition key `user_id` (the same table/key the old client-side
 * `Getuser` used):
 *
 *   user item:    { user_id: "<email>", passwordHash, premium, createdAt }
 *   session item: { user_id: "session#<sha256(token)>", sessionFor: "<email>", expiresAt }
 *
 * Session ids can never clash with users because signup only accepts emails
 * (which contain "@"). Only a SHA-256 hash of the token is stored, so a leaked
 * table dump cannot be replayed as cookies. `expiresAt` is epoch seconds, so it
 * can be used as the table's DynamoDB TTL attribute.
 */

export const SESSION_COOKIE = "beatify_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
const BCRYPT_COST = 12;
const SESSION_PREFIX = "session#";

/** Thrown for expected auth failures. Routes map it to its status code. */
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 409,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const INVALID_LOGIN = "Invalid email or password.";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionKey(token: string) {
  return `${SESSION_PREFIX}${hashToken(token)}`;
}

/** Hash compared against when the user does not exist, so timing does not reveal which emails are registered. */
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= bcrypt.hash("dummy-password-for-timing", BCRYPT_COST);
  return dummyHash;
}

function toSessionUser(item: Record<string, unknown>): SessionUser {
  return {
    username: String(item.user_id),
    premium: item.premium === true,
  };
}

async function createSession(email: string): Promise<string> {
  const config = getUsersConfig();
  const { db } = getClients(config);
  const token = randomBytes(32).toString("base64url");
  await db.send(
    new PutCommand({
      TableName: config.usersTableName,
      Item: {
        user_id: sessionKey(token),
        sessionFor: email,
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
      },
      ConditionExpression: "attribute_not_exists(user_id)",
    }),
  );
  return token;
}

/** Creates an account with a bcrypt-hashed password and signs the user in. */
export async function signUp(
  credentials: Credentials,
): Promise<{ user: SessionUser; token: string }> {
  const config = getUsersConfig();
  const { db } = getClients(config);
  const passwordHash = await bcrypt.hash(credentials.password, BCRYPT_COST);

  try {
    await db.send(
      new PutCommand({
        TableName: config.usersTableName,
        Item: {
          user_id: credentials.email,
          passwordHash,
          premium: false,
          createdAt: Date.now(),
        },
        ConditionExpression: "attribute_not_exists(user_id)",
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      throw new AuthError(409, "An account with this email already exists.");
    }
    throw error;
  }

  const token = await createSession(credentials.email);
  return { user: { username: credentials.email, premium: false }, token };
}

/** Checks the password against the stored bcrypt hash and starts a session. */
export async function logIn(
  credentials: Credentials,
): Promise<{ user: SessionUser; token: string }> {
  const config = getUsersConfig();
  const { db } = getClients(config);
  const { Item } = await db.send(
    new GetCommand({
      TableName: config.usersTableName,
      Key: { user_id: credentials.email },
    }),
  );

  const storedHash = typeof Item?.passwordHash === "string" ? Item.passwordHash : null;
  // Always run one bcrypt compare, even for unknown users or legacy rows without a hash.
  const matches = await bcrypt.compare(
    credentials.password,
    storedHash ?? (await getDummyHash()),
  );
  if (!Item || !storedHash || !matches) {
    throw new AuthError(401, INVALID_LOGIN);
  }

  const token = await createSession(credentials.email);
  return { user: toSessionUser(Item), token };
}

/** Returns the user for a session token, or null if it is missing, unknown or expired. */
export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const config = getUsersConfig();
  const { db } = getClients(config);

  const { Item: session } = await db.send(
    new GetCommand({ TableName: config.usersTableName, Key: { user_id: sessionKey(token) } }),
  );
  if (
    !session ||
    typeof session.sessionFor !== "string" ||
    typeof session.expiresAt !== "number" ||
    session.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  const { Item: user } = await db.send(
    new GetCommand({ TableName: config.usersTableName, Key: { user_id: session.sessionFor } }),
  );
  return user ? toSessionUser(user) : null;
}

/** Deletes the session so the token stops working even if the cookie was copied. */
export async function logOut(token: string | undefined): Promise<void> {
  if (!token) return;
  const config = getUsersConfig();
  const { db } = getClients(config);
  await db.send(
    new DeleteCommand({ TableName: config.usersTableName, Key: { user_id: sessionKey(token) } }),
  );
}

/** Reads the session token from a request's Cookie header. */
export function readSessionToken(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = rest.join("=");
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

/** Cookie options: httpOnly so page scripts can never read the token. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
