import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  LocalstackContainer,
  StartedLocalStackContainer,
} from '@testcontainers/localstack';
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
let storage: StartedLocalStackContainer;

jest.setTimeout(120_000);

beforeAll(async () => {
  async function startPostgres() {
    return new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();
  }

  async function startStorage() {
    return new LocalstackContainer('localstack/localstack:2.2.0').start();
  }

  [postgres, storage] = await Promise.all([startPostgres(), startStorage()]);

  const databaseUrl = postgres.getConnectionUri();
  const s3Endpoint = storage.getConnectionUri();

  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    AWS_S3_ENDPOINT: s3Endpoint,
    AWS_ACCESS_KEY_ID: 'admin',
    AWS_SECRET_ACCESS_KEY: 'pass123',
    AWS_S3_BUCKET: 'test-bucket',
    AWS_REGION: 'us-east-1',
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
  // s3.destroy();
});

afterAll(async () => {
  await Promise.all([postgres?.stop(), storage?.stop()]);
});
