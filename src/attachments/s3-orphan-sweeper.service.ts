import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AppConfigService } from '../config/app-config.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The only key prefixes the app writes (see AttachmentsService). */
export const MANAGED_PREFIXES = ['tasks/', 'comments/', 'avatars/'] as const;

/** Never delete more than this in one run. */
export const MAX_DELETIONS_PER_RUN = 500;

/**
 * If more than this share of the old files looks orphaned, something else is
 * wrong (the app points at another database, or the bucket is shared) and
 * deleting would be a mistake.
 */
export const MAX_ORPHAN_RATIO = 0.5;
const MIN_SAMPLE_FOR_RATIO = 20;

export interface SweepResult {
  mode: 'off' | 'dry-run' | 'delete';
  /** Files older than the grace period that were compared with the database */
  examined: number;
  orphans: number;
  deleted: number;
  /** True when the safety check refused to delete anything */
  aborted: boolean;
}

/**
 * Housekeeping for the bucket. Files can be left without an attachment row
 * when the cleanup after a failed upload, or the purge after a delete, itself
 * fails (S3 outage). Those are only logged at the time; this job finds them
 * later. It is deliberately conservative: off by default, dry-run available,
 * young files are skipped, and a run deletes a bounded number.
 * Running it on several instances is harmless (deleting twice is a no-op).
 */
@Injectable()
export class S3OrphanSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(S3OrphanSweeperService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private config: AppConfigService,
  ) {}

  onModuleInit() {
    if (
      !this.config.backgroundJobsEnabled ||
      this.config.s3.orphanSweep === 'off'
    ) {
      return;
    }

    const first = setTimeout(() => void this.safeRun(), 10 * 60_000);
    first.unref();
    this.timer = setInterval(() => void this.safeRun(), DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async safeRun(): Promise<void> {
    try {
      await this.sweep();
    } catch (err) {
      this.logger.error(`Orphan sweep failed: ${(err as Error).message}`);
    }
  }

  async sweep(now = new Date()): Promise<SweepResult> {
    const { orphanSweep: mode, orphanGraceMs } = this.config.s3;
    const result: SweepResult = {
      mode,
      examined: 0,
      orphans: 0,
      deleted: 0,
      aborted: false,
    };
    if (mode === 'off') return result;

    const cutoff = now.getTime() - orphanGraceMs;
    const orphans: string[] = [];

    for (const prefix of MANAGED_PREFIXES) {
      let token: string | undefined;
      do {
        const page = await this.s3.listObjects(prefix, token);
        token = page.nextToken;

        const old = page.objects
          .filter((o) => o.lastModified.getTime() < cutoff)
          .map((o) => o.key);
        if (old.length === 0) continue;
        result.examined += old.length;

        const known = await this.prisma.attachment.findMany({
          where: { s3Key: { in: old } },
          select: { s3Key: true },
        });
        const referenced = new Set(known.map((a) => a.s3Key));
        orphans.push(...old.filter((key) => !referenced.has(key)));
      } while (token && orphans.length < MAX_DELETIONS_PER_RUN);
    }

    result.orphans = orphans.length;
    if (orphans.length === 0) return result;

    if (
      result.examined >= MIN_SAMPLE_FOR_RATIO &&
      orphans.length / result.examined > MAX_ORPHAN_RATIO
    ) {
      result.aborted = true;
      this.logger.error(
        `Orphan sweep aborted: ${orphans.length} of ${result.examined} old files ` +
          `look unreferenced. Check that this app uses the right database and bucket.`,
      );
      return result;
    }

    const batch = orphans.slice(0, MAX_DELETIONS_PER_RUN);
    if (mode === 'dry-run') {
      this.logger.log(
        `Orphan sweep (dry run): would delete ${batch.length} file(s), e.g. ${batch
          .slice(0, 3)
          .join(', ')}`,
      );
      return result;
    }

    const failed = await this.s3.deleteObjects(this.config.s3.bucket, batch);
    result.deleted = batch.length - failed.length;
    this.logger.log(
      `Orphan sweep: deleted ${result.deleted} file(s)` +
        (failed.length ? `, ${failed.length} failed` : ''),
    );
    return result;
  }
}
