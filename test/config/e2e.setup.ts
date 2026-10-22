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

let postgres: StartedPostgreSqlContainer;
let minio: StartedMinioContainer;

jest.setTimeout(60_000);

beforeAll(async () => {
  async function startPostgres() {
    return new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();
  }

  async function startMinio() {
    return new MinioContainer('minio/minio:RELEASE.2024-12-13T22-19-12Z')
      .withUsername('admin')
      .withPassword('pass123')
      .start();
  }

  [postgres, minio] = await Promise.all([startPostgres(), startMinio()]);

  const databaseUrl = postgres.getConnectionUri();
  const s3Endpoint = `http://${minio.getHost()}:${minio.getPort()}`;

  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    S3_ENDPOINT: s3Endpoint,
    S3_ACCESS_KEY: 'admin',
    S3_SECRET_KEY: 'pass123',
    S3_BUCKET: 'test-bucket',
    S3_REGION: 'us-east-1',
  });

  execSync('npx prisma migrate deploy', {
    env: { ...process.env },
    stdio: 'inherit',
  });

  const s3 = new S3Client({
    endpoint: s3Endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'admin',
      secretAccessKey: 'pass123',
    },
  });

  await s3.send(new CreateBucketCommand({ Bucket: 'test-bucket' }));
  s3.destroy();
});

afterAll(async () => {
  await Promise.all([postgres?.stop(), minio?.stop()]);
});
