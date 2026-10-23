import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { getAppConfig } from '../config/app.config';
import { MIME_EXTENSIONS } from '../common/utils/file-signature';

export interface PresignOptions {
  /** Name the browser should save/show the file as */
  fileName?: string;
  /** Render in the browser (images) instead of forcing a download */
  inline?: boolean;
}

/** RFC 6266 Content-Disposition with an ASCII fallback and a UTF-8 name. */
export function contentDisposition(
  type: 'inline' | 'attachment',
  fileName: string,
): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const { s3 } = getAppConfig();

    this.client = new S3Client({
      region: s3.region,
      endpoint: s3.endpoint,
      // Path-style is only needed for S3-compatible servers (LocalStack, MinIO);
      // real AWS S3 uses virtual-hosted style.
      forcePathStyle: Boolean(s3.endpoint),
      // Without explicit keys the SDK's default chain applies (IAM role, SSO, ...).
      // Passing empty strings would shadow it and fail every request.
      ...(s3.accessKeyId && s3.secretAccessKey
        ? {
            credentials: {
              accessKeyId: s3.accessKeyId,
              secretAccessKey: s3.secretAccessKey,
            },
          }
        : {}),
    });
    this.bucket = s3.bucket;
  }

  /**
   * The object key never contains user-supplied text: the extension comes from
   * the validated MIME type, not from the client's file name.
   */
  async uploadFile(
    buffer: Buffer,
    mimeType: string,
    folder: string,
  ): Promise<{ key: string; bucket: string }> {
    const extension = MIME_EXTENSIONS[mimeType] ?? 'bin';
    const key = `${folder}/${randomUUID()}.${extension}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return { key, bucket: this.bucket };
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }

  /**
   * Delete many objects with one request per 1000 keys.
   * Returns the keys S3 reported as failed (never throws for per-key errors).
   */
  async deleteObjects(bucket: string, keys: string[]): Promise<string[]> {
    const failed: string[] = [];

    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      for (const error of result.Errors ?? []) {
        if (error.Key) failed.push(error.Key);
      }
    }

    return failed;
  }

  async getPresignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds = 3600,
    options: PresignOptions = {},
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(options.fileName && {
        ResponseContentDisposition: contentDisposition(
          options.inline ? 'inline' : 'attachment',
          options.fileName,
        ),
      }),
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
