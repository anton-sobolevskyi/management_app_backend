import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { AppConfigService } from './config/app-config.service';
import { RATE_LIMIT_STORE } from './common/throttler/rate-limit.store';
import { UsersService } from './users/users.service';
import { ProjectMembersService } from './projects/project-members.service';

/**
 * Per-class specs mock their dependencies, so they cannot notice a provider
 * that is missing from a real module (or a circular import between modules).
 * This boots the real dependency-injection graph; only the database is stubbed.
 */
describe('AppModule wiring', () => {
  const env = { ...process.env };

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'wiring-test-secret';
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    process.env.AWS_S3_BUCKET = 'bucket';
    process.env.MAIL_TRANSPORT = 'memory';
  });

  afterAll(() => {
    process.env = env;
  });

  it('resolves every provider, guard and interceptor', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(AppConfigService)).toBeInstanceOf(AppConfigService);
    expect(moduleRef.get(RATE_LIMIT_STORE)).toBeDefined();
    expect(moduleRef.get(UsersService)).toBeDefined();
    expect(moduleRef.get(ProjectMembersService)).toBeDefined();

    await moduleRef.close();
  });
});
