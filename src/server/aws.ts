import "server-only";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

export type AwsConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
  cloudfrontUrl: string;
  tableName: string;
};

const REQUIRED_ENV_VARS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "S3_BUCKET_NAME",
  "CLOUDFRONT_URL",
  "DYNAMODB_TABLE",
] as const;

/** Thrown when one or more AWS env vars are missing. Routes map it to 503. */
export class AwsNotConfiguredError extends Error {
  constructor(public readonly missing: string[]) {
    super("AWS is not configured.");
    this.name = "AwsNotConfiguredError";
  }
}

/** Reads AWS settings from server-only env vars at call time. */
export function getAwsConfig(): AwsConfig {
  const env: Partial<Record<(typeof REQUIRED_ENV_VARS)[number], string>> = {};
  const missing: string[] = [];
  for (const name of REQUIRED_ENV_VARS) {
    const value = process.env[name];
    if (value) env[name] = value;
    else missing.push(name);
  }
  if (
    !env.AWS_ACCESS_KEY_ID ||
    !env.AWS_SECRET_ACCESS_KEY ||
    !env.AWS_REGION ||
    !env.S3_BUCKET_NAME ||
    !env.CLOUDFRONT_URL ||
    !env.DYNAMODB_TABLE
  ) {
    throw new AwsNotConfiguredError(missing);
  }
  return {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    bucketName: env.S3_BUCKET_NAME,
    cloudfrontUrl: env.CLOUDFRONT_URL.replace(/\/+$/, ""),
    tableName: env.DYNAMODB_TABLE,
  };
}

export type AwsCredentialsConfig = Pick<
  AwsConfig,
  "accessKeyId" | "secretAccessKey" | "region"
>;

export type UsersConfig = AwsCredentialsConfig & { usersTableName: string };

const USERS_ENV_VARS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "DYNAMODB_USERS_TABLE",
] as const;

/**
 * Reads the settings login/signup need. Only the credentials and the users
 * table are required, so auth works even if S3/CloudFront are not set up yet.
 */
export function getUsersConfig(): UsersConfig {
  const missing = USERS_ENV_VARS.filter((name) => !process.env[name]);
  const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    DYNAMODB_USERS_TABLE,
  } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !DYNAMODB_USERS_TABLE) {
    throw new AwsNotConfiguredError([...missing]);
  }
  return {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION,
    usersTableName: DYNAMODB_USERS_TABLE,
  };
}

type Clients = { s3: S3Client; db: DynamoDBDocumentClient };

let cached: { signature: string; clients: Clients } | null = null;

/** Returns S3 and DynamoDB clients, reusing them while the config is unchanged. */
export function getClients(config: AwsCredentialsConfig): Clients {
  const signature = `${config.region}|${config.accessKeyId}|${config.secretAccessKey}`;
  if (cached && cached.signature === signature) {
    return cached.clients;
  }
  const credentials = {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  };
  const clients: Clients = {
    s3: new S3Client({ region: config.region, credentials }),
    db: DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: config.region, credentials }),
    ),
  };
  cached = { signature, clients };
  return clients;
}
