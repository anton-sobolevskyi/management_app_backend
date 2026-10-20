import { createHash, randomUUID } from 'crypto';

/** Hash a refresh token for at-rest storage (never store raw JWT). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRequestId(): string {
  return randomUUID();
}
