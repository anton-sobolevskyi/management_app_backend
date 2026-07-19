import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AttachmentType } from '../generated/prisma';
import { AttachmentResponseDto } from './dto/attachment-response.dto';
import { DownloadUrlResponseDto } from './dto/download-url-response.dto';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'text/plain',
];

@Injectable()
export class AttachmentsService {
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
  ) {}

  async uploadForTask(
    taskId: string,
    file: Express.Multer.File,
    uploadedById: string,
  ): Promise<AttachmentResponseDto> {
    this.validateFile(file);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const { key, bucket } = await this.s3Service.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      `tasks/${taskId}`,
    );

    return this.prisma.attachment.create({
      data: {
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        s3Key: key,
        s3Bucket: bucket,
        type: this.resolveType(file.mimetype),
        uploadedById,
        taskId,
      },
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
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const { key, bucket } = await this.s3Service.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      `comments/${commentId}`,
    );

    return this.prisma.attachment.create({
      data: {
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        s3Key: key,
        s3Bucket: bucket,
        type: this.resolveType(file.mimetype),
        uploadedById,
        commentId,
      },
    });
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<AttachmentResponseDto> {
    this.validateFile(file, ['image/jpeg', 'image/png', 'image/webp']);

    const { key, bucket } = await this.s3Service.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      `avatars/${userId}`,
    );

    const attachment = await this.prisma.attachment.create({
      data: {
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        s3Key: key,
        s3Bucket: bucket,
        type: AttachmentType.IMAGE,
        uploadedById: userId,
      },
    });

    const previousAvatar = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarId: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarId: attachment.id },
    });

    if (previousAvatar?.avatarId) {
      await this.remove(previousAvatar.avatarId);
    }

    return attachment;
  }

  async findOne(id: string): Promise<AttachmentResponseDto> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return attachment;
  }

  async getDownloadUrl(id: string): Promise<DownloadUrlResponseDto> {
    const attachment = await this.findOne(id);
    const url = await this.s3Service.getPresignedUrl(
      attachment.s3Key,
      attachment.s3Bucket ?? '',
    );

    return {
      url,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  }

  async findAllForTask(taskId: string): Promise<AttachmentResponseDto[]> {
    return this.prisma.attachment.findMany({ where: { taskId } });
  }

  async remove(id: string): Promise<AttachmentResponseDto> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    await this.s3Service.deleteObject(attachment.s3Bucket, attachment.s3Key);

    return this.prisma.attachment.delete({ where: { id } });
  }

  private validateFile(
    file: Express.Multer.File,
    allowedTypes: string[] = ALLOWED_MIME_TYPES,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds maximum size of 10MB');
    }
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed`,
      );
    }
  }

  private resolveType(mimeType: string): AttachmentType {
    return mimeType.startsWith('image/')
      ? AttachmentType.IMAGE
      : AttachmentType.FILE;
  }
}
