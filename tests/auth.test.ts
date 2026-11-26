import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import bcrypt from "bcryptjs";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import { POST as loginPOST } from "@/app/api/login/route";
import { POST as signupPOST } from "@/app/api/signup/route";
import { POST as logoutPOST } from "@/app/api/logout/route";
import { GET as sessionGET } from "@/app/api/session/route";
import { validateCredentials } from "@/lib/validation";

// bcrypt at cost 12 is deliberately slow.
vi.setConfig({ testTimeout: 30_000 });

const dbMock = mockClient(DynamoDBDocumentClient);

const AUTH_ENV = {
  AWS_ACCESS_KEY_ID: "test-key",
  AWS_SECRET_ACCESS_KEY: "test-secret",
  AWS_REGION: "us-east-1",
  DYNAMODB_USERS_TABLE: "test-users",
};

const EMAIL = "listener@example.com";
const PASSWORD = "correct horse battery";
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

function jsonRequest(url: string, body: unknown, cookie?: string): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function getRequest(url: string, cookie?: string): Request {
  return new Request(`http://localhost${url}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

function setEnv() {
  for (const [name, value] of Object.entries(AUTH_ENV)) vi.stubEnv(name, value);
}
function clearEnv() {
  for (const name of Object.keys(AUTH_ENV)) vi.stubEnv(name, "");
}

function sessionCookie(res: Response): string {
  const header = res.headers.get("set-cookie") ?? "";
  expect(header).toMatch(/^beatify_session=/);
  return header;
}

function tokenFrom(setCookie: string): string {
  return setCookie.split(";")[0].split("=")[1];
}

beforeEach(() => {
  dbMock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("validateCredentials", () => {
  it("normalises the email", () => {
    expect(validateCredentials({ email: "  Me@Example.COM ", password: "12345678" }, "signup")).toEqual({
      ok: true,
      value: { email: "me@example.com", password: "12345678" },
    });
  });

  it.each([
    ["non-object", "nope"],
    ["missing email", { password: "12345678" }],
    ["bad email", { email: "not-an-email", password: "12345678" }],
    ["missing password", { email: EMAIL }],
    ["short signup password", { email: EMAIL, password: "short" }],
    ["password over 72 bytes", { email: EMAIL, password: "é".repeat(37) }],
  ])("rejects %s", (_label, body) => {
    expect(validateCredentials(body, "signup").ok).toBe(false);
  });

  it("does not apply the minimum length on login", () => {
    expect(validateCredentials({ email: EMAIL, password: "short" }, "login").ok).toBe(true);
  });
});

describe("without AWS configured", () => {
  beforeEach(clearEnv);

  it("POST /api/login with a valid body returns 503", async () => {
    const res = await loginPOST(jsonRequest("/api/login", { email: EMAIL, password: PASSWORD }));
    expect(res.status).toBe(503);
  });

  it("POST /api/signup with a valid body returns 503", async () => {
    const res = await signupPOST(jsonRequest("/api/signup", { email: EMAIL, password: PASSWORD }));
    expect(res.status).toBe(503);
  });

  it("still validates first (400 beats 503)", async () => {
    const res = await loginPOST(jsonRequest("/api/login", "{not json"));
    expect(res.status).toBe(400);
  });

  it("GET /api/session without a cookie returns { user: null }", async () => {
    const res = await sessionGET(getRequest("/api/session"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it("POST /api/logout still clears the cookie", async () => {
    const res = await logoutPOST(jsonRequest("/api/logout", {}, "beatify_session=abc"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/beatify_session=;.*Max-Age=0/i);
  });
});

describe("POST /api/signup", () => {
  beforeEach(setEnv);

  it("stores a bcrypt hash (never the password) and sets an httpOnly cookie", async () => {
    dbMock.on(PutCommand).resolves({});
    const res = await signupPOST(jsonRequest("/api/signup", { email: "New@Example.com", password: PASSWORD }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body).toEqual({ user: { username: "new@example.com", premium: false } });
    expect(JSON.stringify(body)).not.toContain("passwordHash");

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);

    const puts = dbMock.commandCalls(PutCommand).map((c) => c.args[0].input);
    expect(puts).toHaveLength(2);
    const [userPut, sessionPut] = puts;

    expect(userPut.TableName).toBe("test-users");
    expect(userPut.ConditionExpression).toBe("attribute_not_exists(user_id)");
    expect(userPut.Item?.user_id).toBe("new@example.com");
    expect(userPut.Item?.passwordHash).not.toBe(PASSWORD);
    expect(JSON.stringify(userPut.Item)).not.toContain(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, userPut.Item?.passwordHash as string)).toBe(true);

    // Only a hash of the token is stored.
    const token = tokenFrom(cookie);
    expect(sessionPut.Item?.user_id).toMatch(/^session#[0-9a-f]{64}$/);
    expect(JSON.stringify(sessionPut.Item)).not.toContain(token);
    expect(sessionPut.Item?.sessionFor).toBe("new@example.com");
  });

  it("returns 409 when the email is already registered", async () => {
    dbMock
      .on(PutCommand)
      .rejects(Object.assign(new Error("exists"), { name: "ConditionalCheckFailedException" }));
    const res = await signupPOST(jsonRequest("/api/signup", { email: EMAIL, password: PASSWORD }));
    expect(res.status).toBe(409);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 400 for a short password without touching AWS", async () => {
    const res = await signupPOST(jsonRequest("/api/signup", { email: EMAIL, password: "short" }));
    expect(res.status).toBe(400);
    expect(dbMock.calls()).toHaveLength(0);
  });
});

describe("POST /api/login", () => {
  beforeEach(setEnv);

  it("logs in with the right password", async () => {
    dbMock
      .on(GetCommand, { Key: { user_id: EMAIL } })
      .resolves({ Item: { user_id: EMAIL, passwordHash, premium: true } });
    dbMock.on(PutCommand).resolves({});

    const res = await loginPOST(jsonRequest("/api/login", { email: EMAIL, password: PASSWORD }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { username: EMAIL, premium: true } });
    expect(sessionCookie(res)).toMatch(/HttpOnly/i);
  });

  it.each([
    ["wrong password", { user_id: EMAIL, passwordHash }, "wrong password!"],
    ["unknown user", undefined, PASSWORD],
    ["legacy user without a password hash", { user_id: EMAIL }, PASSWORD],
  ])("returns the same 401 for %s and sets no cookie", async (_label, item, password) => {
    dbMock.on(GetCommand).resolves({ Item: item });
    const res = await loginPOST(jsonRequest("/api/login", { email: EMAIL, password }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid email or password." });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it("returns a generic 500 (no internal detail) when DynamoDB fails", async () => {
    dbMock.on(GetCommand).rejects(new Error("internal dynamo detail"));
    const res = await loginPOST(jsonRequest("/api/login", { email: EMAIL, password: PASSWORD }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("internal dynamo detail");
  });
});

describe("session lifecycle", () => {
  beforeEach(setEnv);

  it("login -> GET /api/session -> logout", async () => {
    dbMock
      .on(GetCommand, { Key: { user_id: EMAIL } })
      .resolves({ Item: { user_id: EMAIL, passwordHash, premium: false } });
    dbMock.on(PutCommand).resolves({});

    const loginRes = await loginPOST(jsonRequest("/api/login", { email: EMAIL, password: PASSWORD }));
    const token = tokenFrom(sessionCookie(loginRes));
    const sessionItem = dbMock.commandCalls(PutCommand)[0].args[0].input.Item!;

    dbMock.on(GetCommand, { Key: { user_id: sessionItem.user_id } }).resolves({ Item: sessionItem });
    const sessionRes = await sessionGET(getRequest("/api/session", `beatify_session=${token}`));
    expect(await sessionRes.json()).toEqual({ user: { username: EMAIL, premium: false } });

    dbMock.on(DeleteCommand).resolves({});
    const logoutRes = await logoutPOST(jsonRequest("/api/logout", {}, `beatify_session=${token}`));
    expect(logoutRes.status).toBe(200);
    expect(dbMock.commandCalls(DeleteCommand)[0].args[0].input.Key).toEqual({
      user_id: sessionItem.user_id,
    });
    expect(logoutRes.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });

  it("treats an expired session as signed out", async () => {
    dbMock.on(GetCommand).resolves({
      Item: { user_id: "session#x", sessionFor: EMAIL, expiresAt: Math.floor(Date.now() / 1000) - 1 },
    });
    const res = await sessionGET(getRequest("/api/session", "beatify_session=old-token"));
    expect(await res.json()).toEqual({ user: null });
  });

  it("treats an unknown token as signed out", async () => {
    dbMock.on(GetCommand).resolves({});
    const res = await sessionGET(getRequest("/api/session", "beatify_session=forged"));
    expect(await res.json()).toEqual({ user: null });
  });
});
