import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { MinioContainer, StartedMinioContainer } from '@testcontainers/minio';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { resolve } from 'path';

config({
  path: resolve(__dirname, '../../.env.test'),
  override: true,
  quiet: true,
});

let postgresContainer: StartedPostgreSqlContainer;
let minioContainer: StartedMinioContainer;

jest.setTimeout(120000);

beforeAll(async () => {
  // Throwaway Postgres + S3-compatible storage: no cloud credentials needed,
  // and tests never touch a real bucket.
  [postgresContainer, minioContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start(),
    new MinioContainer('minio/minio:RELEASE.2024-01-16T16-07-38Z')
      .withUsername('minioadmin')
      .withPassword('minioadmin')
      .start(),
  ]);

  process.env.DATABASE_URL = postgresContainer.getConnectionUri();

  process.env.AWS_S3_ENDPOINT = minioContainer.getConnectionUrl();
  process.env.AWS_ACCESS_KEY_ID = minioContainer.getUsername();
  process.env.AWS_SECRET_ACCESS_KEY = minioContainer.getPassword();

  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    endpoint: process.env.AWS_S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  await s3.send(new CreateBucketCommand({ Bucket: process.env.AWS_S3_BUCKET }));

  // maxWorkers: 1 — sequential migrate only (client generated before Jest)
  execSync('npx prisma migrate deploy', {
    env: { ...process.env },
    stdio: 'inherit',
  });
});

afterAll(async () => {
  await Promise.all([postgresContainer?.stop(), minioContainer?.stop()]);
});
