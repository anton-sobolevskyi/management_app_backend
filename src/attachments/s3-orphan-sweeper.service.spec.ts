import {
  MAX_DELETIONS_PER_RUN,
  S3OrphanSweeperService,
} from './s3-orphan-sweeper.service';
import { AppConfigService } from '../config/app-config.service';

const NOW = new Date('2026-10-24T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const obj = (key: string, ageHours: number) => ({
  key,
  lastModified: hoursAgo(ageHours),
});

describe('S3OrphanSweeperService', () => {
  const prisma = { attachment: { findMany: jest.fn() } };
  const s3 = { listObjects: jest.fn(), deleteObjects: jest.fn() };

  function build(env: NodeJS.ProcessEnv = {}) {
    return new S3OrphanSweeperService(
      prisma as any,
      s3 as any,
      new AppConfigService({
        AWS_S3_BUCKET: 'bucket',
        S3_ORPHAN_SWEEP: 'delete',
        ...env,
      }),
    );
  }

  /** The database knows exactly these keys. */
  const dbKnows = (...keys: string[]) =>
    prisma.attachment.findMany.mockImplementation(
      ({ where }: { where: { s3Key: { in: string[] } } }) =>
        Promise.resolve(
          where.s3Key.in
            .filter((k) => keys.includes(k))
            .map((s3Key) => ({ s3Key })),
        ),
    );

  /** Only the `tasks/` prefix has files, in one page. */
  const bucketHolds = (...objects: ReturnType<typeof obj>[]) =>
    s3.listObjects.mockImplementation((prefix: string) =>
      Promise.resolve({
        objects: prefix === 'tasks/' ? objects : [],
        nextToken: undefined,
      }),
    );

  beforeEach(() => {
    jest.resetAllMocks();
    s3.deleteObjects.mockResolvedValue([]);
  });

  it('does nothing and never touches S3 when switched off (the default)', async () => {
    const result = await build({ S3_ORPHAN_SWEEP: '' }).sweep(NOW);

    expect(result.mode).toBe('off');
    expect(s3.listObjects).not.toHaveBeenCalled();
    expect(s3.deleteObjects).not.toHaveBeenCalled();
  });

  it('deletes old files no attachment points to, and only those', async () => {
    bucketHolds(
      obj('tasks/t1/kept.txt', 100),
      obj('tasks/t1/orphan.txt', 100),
      obj('tasks/t1/fresh-orphan.txt', 1), // inside the grace period
    );
    dbKnows('tasks/t1/kept.txt');

    const result = await build().sweep(NOW);

    expect(s3.deleteObjects).toHaveBeenCalledWith('bucket', [
      'tasks/t1/orphan.txt',
    ]);
    expect(result).toMatchObject({ examined: 2, orphans: 1, deleted: 1 });
  });

  it('only asks the database about files old enough to matter', async () => {
    bucketHolds(obj('tasks/a.txt', 100), obj('tasks/b.txt', 2));
    dbKnows('tasks/a.txt');

    await build().sweep(NOW);

    expect(prisma.attachment.findMany).toHaveBeenCalledWith({
      where: { s3Key: { in: ['tasks/a.txt'] } },
      select: { s3Key: true },
    });
  });

  it('scans only the prefixes the app writes', async () => {
    bucketHolds();
    await build().sweep(NOW);

    expect(s3.listObjects.mock.calls.map(([prefix]) => prefix)).toEqual([
      'tasks/',
      'comments/',
      'avatars/',
    ]);
  });

  it('honours S3_ORPHAN_GRACE_HOURS', async () => {
    bucketHolds(obj('tasks/a.txt', 30));
    dbKnows();

    await build({ S3_ORPHAN_GRACE_HOURS: '48' }).sweep(NOW);

    expect(s3.deleteObjects).not.toHaveBeenCalled();
  });

  it('dry-run reports but deletes nothing', async () => {
    bucketHolds(obj('tasks/a.txt', 100), obj('tasks/b.txt', 100));
    dbKnows('tasks/b.txt');

    const result = await build({ S3_ORPHAN_SWEEP: 'dry-run' }).sweep(NOW);

    expect(result).toMatchObject({ orphans: 1, deleted: 0, aborted: false });
    expect(s3.deleteObjects).not.toHaveBeenCalled();
  });

  it('follows pagination', async () => {
    s3.listObjects
      .mockResolvedValueOnce({
        objects: [obj('tasks/a.txt', 100)],
        nextToken: 'page2',
      })
      .mockResolvedValueOnce({ objects: [obj('tasks/b.txt', 100)] })
      .mockResolvedValue({ objects: [] });
    dbKnows('tasks/a.txt', 'tasks/b.txt', 'tasks/x');

    const result = await build().sweep(NOW);

    expect(s3.listObjects).toHaveBeenCalledWith('tasks/', 'page2');
    expect(result.examined).toBe(2);
    expect(result.orphans).toBe(0);
  });

  it('refuses to delete when most old files look unreferenced (wrong database?)', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      obj(`tasks/${i}.txt`, 100),
    );
    bucketHolds(...many);
    dbKnows(many[0].key); // 29 of 30 unreferenced

    const result = await build().sweep(NOW);

    expect(result).toMatchObject({ aborted: true, deleted: 0, orphans: 29 });
    expect(s3.deleteObjects).not.toHaveBeenCalled();
  });

  it('does not apply the ratio check to a tiny sample', async () => {
    bucketHolds(obj('tasks/a.txt', 100), obj('tasks/b.txt', 100));
    dbKnows();

    const result = await build().sweep(NOW);

    expect(result).toMatchObject({ aborted: false, deleted: 2 });
  });

  it('deletes at most MAX_DELETIONS_PER_RUN per run', async () => {
    const referenced = Array.from({ length: 700 }, (_, i) =>
      obj(`tasks/k${i}`, 100),
    );
    const orphans = Array.from(
      { length: MAX_DELETIONS_PER_RUN + 100 },
      (_, i) => obj(`tasks/o${i}`, 100),
    );
    bucketHolds(...referenced, ...orphans);
    dbKnows(...referenced.map((o) => o.key));

    await build().sweep(NOW);

    const [, keys] = s3.deleteObjects.mock.calls[0];
    expect(keys).toHaveLength(MAX_DELETIONS_PER_RUN);
  });

  it('counts only what S3 really deleted', async () => {
    bucketHolds(obj('tasks/a.txt', 100), obj('tasks/b.txt', 100));
    dbKnows();
    s3.deleteObjects.mockResolvedValue(['tasks/b.txt']);

    const result = await build().sweep(NOW);

    expect(result.deleted).toBe(1);
  });
});
