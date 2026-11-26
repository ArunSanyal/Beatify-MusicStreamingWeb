import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async (_client: unknown, command: PutObjectCommand) =>
    `https://bucket.example/${command.input.Key}?X-Amz-Signature=fake`,
  ),
}));

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { POST as uploadPOST } from "@/app/api/upload/route";
import { GET as songsGET, POST as songsPOST } from "@/app/api/songs/route";
import { isValidS3Key } from "@/lib/validation";

const s3Mock = mockClient(S3Client);
const dbMock = mockClient(DynamoDBDocumentClient);

const AWS_ENV = {
  AWS_ACCESS_KEY_ID: "test-key",
  AWS_SECRET_ACCESS_KEY: "test-secret",
  AWS_REGION: "us-east-1",
  S3_BUCKET_NAME: "test-bucket",
  CLOUDFRONT_URL: "https://cdn.example.net/",
  DYNAMODB_TABLE: "test-table",
};

function jsonRequest(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validUpload = { title: "My Song", contentType: "audio/mpeg", size: 2048 };

function setAwsEnv() {
  for (const [name, value] of Object.entries(AWS_ENV)) vi.stubEnv(name, value);
}
function clearAwsEnv() {
  for (const name of Object.keys(AWS_ENV)) vi.stubEnv(name, "");
}

beforeEach(() => {
  s3Mock.reset();
  dbMock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("without AWS configured", () => {
  beforeEach(clearAwsEnv);

  it("GET /api/songs returns 503 JSON", async () => {
    const res = await songsGET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: expect.stringContaining("AWS is not configured") });
  });

  it("POST /api/upload with a valid body returns 503", async () => {
    const res = await uploadPOST(jsonRequest("/api/upload", validUpload));
    expect(res.status).toBe(503);
  });

  it("POST /api/upload still validates first (400 beats 503)", async () => {
    const res = await uploadPOST(jsonRequest("/api/upload", { title: "" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/upload validation", () => {
  beforeEach(setAwsEnv);

  it.each([
    ["invalid JSON", "{not json"],
    ["empty object", {}],
    ["non-MP3 content type", { ...validUpload, contentType: "audio/wav" }],
    ["file over 15 MB", { ...validUpload, size: 15 * 1024 * 1024 + 1 }],
    ["title over 100 chars", { ...validUpload, title: "a".repeat(101) }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await uploadPOST(jsonRequest("/api/upload", body));
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });
});

describe("happy path with mocked AWS", () => {
  beforeEach(setAwsEnv);

  it("upload -> save -> list", async () => {
    // 1. Ask for a presigned URL.
    const uploadRes = await uploadPOST(jsonRequest("/api/upload", validUpload));
    expect(uploadRes.status).toBe(200);
    const { uploadUrl, key } = (await uploadRes.json()) as { uploadUrl: string; key: string };
    expect(isValidS3Key(key)).toBe(true);
    expect(key).toMatch(/-my-song\.mp3$/);
    expect(uploadUrl).toContain(key);

    const signedCommand = vi.mocked(getSignedUrl).mock.calls[0][1] as PutObjectCommand;
    expect(signedCommand.input).toMatchObject({
      Bucket: "test-bucket",
      Key: key,
      ContentType: "audio/mpeg",
    });

    // 2. Save the song after the (simulated) S3 PUT.
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 2048, ContentType: "audio/mpeg" });
    dbMock.on(PutCommand).resolves({});
    const saveRes = await songsPOST(jsonRequest("/api/songs", { title: "My Song", key }));
    expect(saveRes.status).toBe(201);
    const { song } = (await saveRes.json()) as { song: { id: string; url: string } };
    expect(song.url).toBe(`https://cdn.example.net/${key}`);

    const putInput = dbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(putInput.TableName).toBe("test-table");
    expect(putInput.Item).toMatchObject({
      pk: song.id,
      title: "My Song",
      uploadedBy: "Arun",
      s3Key: key,
    });

    // 3. List songs: paginated scan, malformed rows skipped, newest first.
    dbMock
      .on(ScanCommand)
      .resolvesOnce({
        Items: [{ ...putInput.Item }, { pk: "bad-row" }],
        LastEvaluatedKey: { pk: "x" },
      })
      .resolvesOnce({
        Items: [{ pk: "old", title: "Old", url: "https://cdn.example.net/o.mp3", createdAt: 1 }],
      });
    const listRes = await songsGET();
    expect(listRes.status).toBe(200);
    const { songs } = (await listRes.json()) as { songs: { id: string }[] };
    expect(songs.map((s) => s.id)).toEqual([song.id, "old"]);
    expect(dbMock.commandCalls(ScanCommand)).toHaveLength(2);
  });
});

describe("POST /api/songs server-side checks", () => {
  beforeEach(setAwsEnv);
  const key = "songs/123e4567-e89b-42d3-a456-426614174000-x.mp3";

  it("rejects an arbitrary key with 400 and never touches AWS", async () => {
    const res = await songsPOST(jsonRequest("/api/songs", { title: "x", key: "../evil.mp3" }));
    expect(res.status).toBe(400);
    expect(s3Mock.calls()).toHaveLength(0);
  });

  it("returns 400 when the uploaded object does not exist", async () => {
    s3Mock.on(HeadObjectCommand).rejects(Object.assign(new Error("missing"), { name: "NotFound" }));
    const res = await songsPOST(jsonRequest("/api/songs", { title: "x", key }));
    expect(res.status).toBe(400);
    expect(dbMock.calls()).toHaveLength(0);
  });

  it("deletes an oversized object and returns 400", async () => {
    s3Mock
      .on(HeadObjectCommand)
      .resolves({ ContentLength: 20 * 1024 * 1024, ContentType: "audio/mpeg" });
    s3Mock.on(DeleteObjectCommand).resolves({});
    const res = await songsPOST(jsonRequest("/api/songs", { title: "x", key }));
    expect(res.status).toBe(400);
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1);
    expect(dbMock.calls()).toHaveLength(0);
  });

  it("returns a generic 500 (no stack trace) when DynamoDB fails", async () => {
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 10, ContentType: "audio/mpeg" });
    dbMock.on(PutCommand).rejects(new Error("internal dynamo detail"));
    const res = await songsPOST(jsonRequest("/api/songs", { title: "x", key }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("internal dynamo detail");
  });
});
