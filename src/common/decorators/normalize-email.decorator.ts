import { Transform } from 'class-transformer';
import { normalizeEmail } from '../utils/email';

/** DTO property decorator: trims and lower-cases the incoming email. */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
