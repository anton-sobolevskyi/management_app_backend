import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { S3Service } from '../src/s3/s3.service';
import { S3OrphanSweeperService } from '../src/attachments/s3-orphan-sweeper.service';
import {
  bearer,
  createProject,
  createTask,
  createTestApp,
  registerUser,
  TEXT,
} from './helpers';

describe('S3 orphan sweeper (e2e)', () => {
  let app: INestApplication;
  let s3: S3Service;
  let sweeper: S3OrphanSweeperService;
  let taskId: string;
  let keptKey: string;
  let orphanKey: string;

  const DAY_MS = 24 * 3_600_000;
  const keysUnder = async (prefix: string) =>
    (await s3.listObjects(prefix)).objects.map((o) => o.key);

  beforeAll(async () => {
    // Config is read when the app starts
    process.env.S3_ORPHAN_SWEEP = 'delete';
    app = await createTestApp();
    s3 = app.get(S3Service);
    sweeper = app.get(S3OrphanSweeperService);

    const owner = await registerUser(app);
    const projectId = await createProject(app, owner);
    taskId = (await createTask(app, owner, projectId)).id;

    // A file the normal way: stored AND recorded in the database
    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments`)
      .set(...bearer(owner))
      .attach('file', TEXT, { filename: 'kept.txt', contentType: 'text/plain' })
      .expect(201);
    [keptKey] = await keysUnder(`tasks/${taskId}/`);

    // A file with no row, as left behind by a failed cleanup
    ({ key: orphanKey } = await s3.uploadFile(
      TEXT,
      'text/plain',
      `tasks/${taskId}`,
    ));
  });

  afterAll(async () => {
    delete process.env.S3_ORPHAN_SWEEP;
    await app.close();
  });

  it('leaves everything alone inside the grace period (uploads in flight)', async () => {
    const result = await sweeper.sweep();

    expect(result.deleted).toBe(0);
    expect(await keysUnder(`tasks/${taskId}/`)).toEqual(
      expect.arrayContaining([keptKey, orphanKey]),
    );
  });

  it('deletes the orphan once it is old enough and keeps the attached file', async () => {
    const result = await sweeper.sweep(new Date(Date.now() + 2 * DAY_MS));

    expect(result.aborted).toBe(false);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const remaining = await keysUnder(`tasks/${taskId}/`);
    expect(remaining).toContain(keptKey);
    expect(remaining).not.toContain(orphanKey);
  });

  it('a second run finds nothing more to do', async () => {
    const result = await sweeper.sweep(new Date(Date.now() + 2 * DAY_MS));

    expect(result.orphans).toBe(0);
    expect(await keysUnder(`tasks/${taskId}/`)).toContain(keptKey);
  });
});
