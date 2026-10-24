import { Global, Module } from '@nestjs/common';
import { InMemoryRateLimitStore, RATE_LIMIT_STORE } from './rate-limit.store';

/**
 * Provides the shared rate-limit store. Swap `useFactory` for a Redis-backed
 * store to enforce limits across several instances.
 */
@Global()
@Module({
  providers: [
    {
      provide: RATE_LIMIT_STORE,
      useFactory: () => new InMemoryRateLimitStore(),
    },
  ],
  exports: [RATE_LIMIT_STORE],
})
export class RateLimitModule {}
