import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { AttachmentType } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { AttachmentResponseDto } from './dto/attachment-response.dto';
import { DownloadUrlResponseDto } from './dto/download-url-response.dto';
import {
  ALLOWED_MIME_TYPES,
  ATTACHMENT_PUBLIC_SELECT,
  IMAGE_MIME_TYPES,
  MAX_ATTACHMENTS_PER_COMMENT,
  MAX_ATTACHMENTS_PER_TASK,
  MAX_FILE_SIZE,
} from './attachments.constants';
import {
  matchesDeclaredType,
  sanitizeFileName,
} from '../common/utils/file-signature';

/** Where a stored file lives; enough to delete it from S3. */
export interface StoredObject {
  s3Bucket: string;
  s3Key: string;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    private authz: AuthorizationService,
  ) {}

  async uploadForTask(
    taskId: string,
    file: Express.Multer.File,
    uploadedById: string,
  ): Promise<AttachmentResponseDto> {
    this.validateFile(file);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const existing = await this.prisma.attachment.count({ where: { taskId } });
    if (existing >= MAX_ATTACHMENTS_PER_TASK) {
      throw new BadRequestException(
        `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} attachments`,
      );
    }

    return this.storeAndCreate(file, `tasks/${taskId}`, {
      uploadedById,
      taskId,
    });
  }

  async uploadForComment(
    commentId: string,
    file: Express.Multer.File,
    uploadedById: string,
  ): Promise<AttachmentResponseDto> {
    this.validateFile(file);

    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: {
        id: true,
        authorId: true,
        task: { select: { projectId: true } },
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Same rule as editing the comment itself: author or project OWNER/ADMIN
    await this.authz.assertCommentAuthorOrAdmin(uploadedById, comment);

    const existing = await this.prisma.attachment.count({
      where: { commentId },
    });
    if (existing >= MAX_ATTACHMENTS_PER_COMMENT) {
      throw new BadRequestException(
        `A comment can have at most ${MAX_ATTACHMENTS_PER_COMMENT} attachments`,
      );
    }

    return this.storeAndCreate(file, `comments/${commentId}`, {
      uploadedById,
      commentId,
    });
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<AttachmentResponseDto> {
    this.validateFile(file, IMAGE_MIME_TYPES);

    const { key, bucket } = await this.s3Service.uploadFile(
      file.buffer,
      file.mimetype,
      `avatars/${userId}`,
    );

    let result: {
      attachment: AttachmentResponseDto;
      previousAvatarId: string | null;
    };

    try {
      // New row and the user's pointer to it change together
      result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { avatarId: true },
        });

        const attachment = await tx.attachment.create({
          data: this.rowFor(file, key, bucket, {
            uploadedById: userId,
          }),
          select: ATTACHMENT_PUBLIC_SELECT,
        });

        await tx.user.update({
          where: { id: userId },
          data: { avatarId: attachment.id },
        });

        return { attachment, previousAvatarId: user?.avatarId ?? null };
      });
    } catch (err) {
      await this.discardUpload(bucket, key);
      throw err;
    }

    if (result.previousAvatarId) {
      await this.remove(result.previousAvatarId).catch((err: Error) =>
        this.logger.warn(`Could not remove old avatar: ${err.message}`),
      );
    }

    return result.attachment;
  }

  /** Internal lookup that includes storage coordinates. Never return this to clients. */
  private async findStored(id: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return attachment;
  }

  async findOne(id: string): Promise<AttachmentResponseDto> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      select: ATTACHMENT_PUBLIC_SELECT,
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return attachment;
  }

  async getDownloadUrl(id: string): Promise<DownloadUrlResponseDto> {
    const attachment = await this.findStored(id);
    const url = await this.s3Service.getPresignedUrl(
      attachment.s3Bucket,
      attachment.s3Key,
      3600,
      {
        fileName: attachment.fileName,
        inline: attachment.type === AttachmentType.IMAGE,
      },
    );

    return {
      url,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  }

  async findAllForTask(taskId: string): Promise<AttachmentResponseDto[]> {
    return this.prisma.attachment.findMany({
      where: { taskId },
      select: ATTACHMENT_PUBLIC_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Delete on behalf of a user: the uploader or a project OWNER/ADMIN
   * (avatars: only their owner).
   */
  async removeByUser(
    id: string,
    userId: string,
  ): Promise<AttachmentResponseDto> {
    const attachment = await this.authz.assertAttachmentAccess(userId, id);
    await this.authz.assertAttachmentManage(userId, attachment);

    return this.remove(id);
  }

  /** Database row first, then the object: a failed S3 call can't leave a dangling row. */
  async remove(id: string): Promise<AttachmentResponseDto> {
    const attachment = await this.findStored(id);

    await this.prisma.attachment.delete({ where: { id } });
    await this.purgeObjects([attachment]);

    return this.toPublic(attachment);
  }

  /**
   * Delete the attachment rows of the given tasks/comments (or of a whole
   * project) inside the caller's transaction and return the files to purge.
   * Call `purgeObjects` with the result only after the transaction commits, so
   * a rollback never leaves rows pointing at deleted files.
   *
   * `projectId` uses relation filters, so deleting a big project doesn't
   * build huge `IN (...)` lists.
   */
  async detachFor(
    tx: Prisma.TransactionClient,
    scope: { taskIds?: string[]; commentIds?: string[]; projectId?: string },
  ): Promise<StoredObject[]> {
    const or: Prisma.AttachmentWhereInput[] = [];
    if (scope.taskIds?.length) or.push({ taskId: { in: scope.taskIds } });
    if (scope.commentIds?.length) {
      or.push({ commentId: { in: scope.commentIds } });
    }
    if (scope.projectId) {
      or.push(
        { task: { projectId: scope.projectId } },
        { comment: { task: { projectId: scope.projectId } } },
      );
    }
    if (or.length === 0) return [];

    const attachments = await tx.attachment.findMany({
      where: { OR: or },
      select: { id: true, s3Bucket: true, s3Key: true },
    });

    if (attachments.length > 0) {
      await tx.attachment.deleteMany({
        where: { id: { in: attachments.map((a) => a.id) } },
      });
    }

    return attachments;
  }

  /**
   * Best-effort S3 cleanup; failures are logged, never thrown. Many objects
   * are removed with batched DeleteObjects calls (1000 keys per request).
   */
  async purgeObjects(objects: StoredObject[]): Promise<void> {
    if (objects.length === 1) {
      await this.discardUpload(objects[0].s3Bucket, objects[0].s3Key);
      return;
    }

    const byBucket = new Map<string, string[]>();
    for (const { s3Bucket, s3Key } of objects) {
      const keys = byBucket.get(s3Bucket) ?? [];
      keys.push(s3Key);
      byBucket.set(s3Bucket, keys);
    }

    for (const [bucket, keys] of byBucket) {
      try {
        const failed = await this.s3Service.deleteObjects(bucket, keys);
        if (failed.length > 0) {
          this.logger.warn(
            `Failed to delete ${failed.length} S3 object(s) in ${bucket}, e.g. ${failed[0]}`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to delete ${keys.length} S3 object(s) in ${bucket}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async discardUpload(bucket: string, key: string): Promise<void> {
    try {
      await this.s3Service.deleteObject(bucket, key);
    } catch (err) {
      this.logger.warn(
        `Failed to delete S3 object ${key}: ${(err as Error).message}`,
      );
    }
  }

  /** Upload to S3, then record it; if recording fails the upload is removed again. */
  private async storeAndCreate(
    file: Express.Multer.File,
    folder: string,
    link: { uploadedById: string; taskId?: string; commentId?: string },
  ): Promise<AttachmentResponseDto> {
    const { key, bucket } = await this.s3Service.uploadFile(
      file.buffer,
      file.mimetype,
      folder,
    );

    try {
      return await this.prisma.attachment.create({
        data: this.rowFor(file, key, bucket, link),
        select: ATTACHMENT_PUBLIC_SELECT,
      });
    } catch (err) {
      await this.discardUpload(bucket, key);
      throw err;
    }
  }

  private rowFor(
    file: Express.Multer.File,
    key: string,
    bucket: string,
    link: { uploadedById: string; taskId?: string; commentId?: string },
  ): Prisma.AttachmentUncheckedCreateInput {
    return {
      fileName: sanitizeFileName(file.originalname),
      mimeType: file.mimetype,
      sizeBytes: file.size,
      s3Key: key,
      s3Bucket: bucket,
      type: this.resolveType(file.mimetype),
      ...link,
    };
  }

  private toPublic(attachment: AttachmentResponseDto): AttachmentResponseDto {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      type: attachment.type,
      uploadedById: attachment.uploadedById,
      taskId: attachment.taskId,
      commentId: attachment.commentId,
      createdAt: attachment.createdAt,
    };
  }

  private validateFile(
    file: Express.Multer.File | undefined,
    allowedTypes: string[] = ALLOWED_MIME_TYPES,
  ): asserts file is Express.Multer.File {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (file.size === 0) {
      throw new BadRequestException('File is empty');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds maximum size of 10MB');
    }
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed`,
      );
    }
    // The declared type is client-controlled; check the bytes agree with it
    if (!matchesDeclaredType(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'File content does not match its declared type',
      );
    }
  }

  private resolveType(mimeType: string): AttachmentType {
    return mimeType.startsWith('image/')
      ? AttachmentType.IMAGE
      : AttachmentType.FILE;
  }
}
