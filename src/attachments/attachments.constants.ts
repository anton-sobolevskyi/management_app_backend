import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Soft caps so one task/comment can't accumulate unbounded storage. */
export const MAX_ATTACHMENTS_PER_TASK = 50;
export const MAX_ATTACHMENTS_PER_COMMENT = 10;

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const ALLOWED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  'application/pdf',
  'application/msword',
  'text/plain',
];

/**
 * Shared by every upload route. `defParamCharset: 'utf8'` makes multer decode
 * non-ASCII file names (e.g. "звіт.pdf") correctly instead of as latin1.
 */
export const UPLOAD_OPTIONS: MulterOptions = {
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  defParamCharset: 'utf8',
};

/**
 * Attachment columns that are safe to return to clients. Storage coordinates
 * (s3Key, s3Bucket) stay server-side.
 */
export const ATTACHMENT_PUBLIC_SELECT = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  type: true,
  uploadedById: true,
  taskId: true,
  commentId: true,
  createdAt: true,
} as const;
