import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
  ) {}

  async create(
    taskId: string,
    dto: CreateCommentDto,
    authorId: string,
  ): Promise<CommentResponseDto> {
    return this.prisma.comment.create({
      data: { content: dto.content, taskId, authorId },
    });
  }

  async findAll(taskId: string): Promise<CommentResponseDto[]> {
    return this.prisma.comment.findMany({
      where: { taskId, deletedAt: null },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarId: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string): Promise<CommentResponseDto> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, deletedAt: null },
      include: { attachments: true },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return comment;
  }

  async update(
    id: string,
    dto: UpdateCommentDto,
    userId: string,
  ): Promise<CommentResponseDto> {
    const comment = await this.authz.assertCommentAccess(userId, id);
    await this.authz.assertCommentAuthorOrAdmin(userId, comment);

    return this.prisma.comment.update({
      where: { id },
      data: dto,
    });
  }

  async softDelete(id: string, userId: string): Promise<CommentResponseDto> {
    const comment = await this.authz.assertCommentAccess(userId, id);
    await this.authz.assertCommentAuthorOrAdmin(userId, comment);

    return this.prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
