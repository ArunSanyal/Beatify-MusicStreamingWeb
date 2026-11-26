import "server-only";

import { randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

import { getAwsConfig, getClients } from "@/server/aws";
import type { Song } from "@/lib/types";
import {
  ALLOWED_CONTENT_TYPE,
  MAX_FILE_SIZE_BYTES,
  buildS3Key,
  type SaveSongRequest,
  type UploadRequest,
} from "@/lib/validation";

/** The app has no login yet, so every upload is credited to this name. */
export const DEFAULT_AUTHOR = "Arun";

const UPLOAD_URL_TTL_SECONDS = 60;

/** Thrown when an uploaded object fails server-side checks. Routes map it to 400. */
export class UploadRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRejectedError";
  }
}

/** Creates a short-lived presigned S3 PUT URL for one MP3 upload. */
export async function createUploadUrl(
  request: UploadRequest,
): Promise<{ uploadUrl: string; key: string }> {
  const config = getAwsConfig();
  const { s3 } = getClients(config);
  const key = buildS3Key(randomUUID(), request.title);
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ContentType: ALLOWED_CONTENT_TYPE,
  });
  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });
  return { uploadUrl, key };
}

/**
 * Checks the uploaded object really exists and is a valid MP3 within the size
 * limit (a presigned PUT URL cannot enforce size), then records it in DynamoDB.
 */
export async function saveSong(request: SaveSongRequest): Promise<Song> {
  const config = getAwsConfig();
  const { s3, db } = getClients(config);

  let head;
  try {
    head = await s3.send(
      new HeadObjectCommand({ Bucket: config.bucketName, Key: request.key }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "NotFound") {
      throw new UploadRejectedError("Uploaded file was not found.");
    }
    throw error;
  }

  const size = head.ContentLength ?? 0;
  if (
    size <= 0 ||
    size > MAX_FILE_SIZE_BYTES ||
    head.ContentType !== ALLOWED_CONTENT_TYPE
  ) {
    await s3.send(
      new DeleteObjectCommand({ Bucket: config.bucketName, Key: request.key }),
    );
    throw new UploadRejectedError(
      "Uploaded file must be an MP3 of 15 MB or smaller.",
    );
  }

  const id = randomUUID();
  const song: Song = {
    id,
    title: request.title,
    uploadedBy: DEFAULT_AUTHOR,
    url: `${config.cloudfrontUrl}/${request.key}`,
    createdAt: Date.now(),
  };

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        pk: id,
        sk: id,
        title: song.title,
        uploadedBy: song.uploadedBy,
        url: song.url,
        s3Key: request.key,
        createdAt: song.createdAt,
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );

  return song;
}

function toSong(item: Record<string, unknown>): Song | null {
  const { pk, title, uploadedBy, url, createdAt } = item;
  if (typeof pk !== "string" || typeof title !== "string" || typeof url !== "string") {
    return null;
  }
  return {
    id: pk,
    title,
    url,
    uploadedBy: typeof uploadedBy === "string" ? uploadedBy : "Unknown",
    createdAt: typeof createdAt === "number" ? createdAt : 0,
  };
}

/** Lists all songs, newest first. Malformed rows are skipped. */
export async function listSongs(): Promise<Song[]> {
  const config = getAwsConfig();
  const { db } = getClients(config);

  const songs: Song[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new ScanCommand({ TableName: config.tableName, ExclusiveStartKey: startKey }),
    );
    for (const item of page.Items ?? []) {
      const song = toSong(item);
      if (song) songs.push(song);
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);

  return songs.sort((a, b) => b.createdAt - a.createdAt);
}
