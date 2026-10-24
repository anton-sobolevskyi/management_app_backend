import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ATTACHMENT_PUBLIC_SELECT } from '../attachments/attachments.constants';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
  paginate,
  paginationArgs,
} from '../common/dto/pagination.dto';
import { USER_PUBLIC_SELECT } from '../users/user-select';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
    private attachmentsService: AttachmentsService,
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

  async findAll(
    taskId: string,
    query: PaginationQueryDto = {},
  ): Promise<PaginatedResponseDto<CommentResponseDto>> {
    const { page, limit, skip } = paginationArgs(query);
    const where = { taskId, deletedAt: null };

    const [total, data] = await Promise.all([
      this.prisma.comment.count({ where }),
      this.prisma.comment.findMany({
        where,
        include: {
          author: { select: USER_PUBLIC_SELECT },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string): Promise<CommentResponseDto> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, deletedAt: null },
      include: { attachments: { select: ATTACHMENT_PUBLIC_SELECT } },
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
    // One query: access check and caller role; no extra membership lookup
    const comment = await this.authz.assertCommentAccess(userId, id);
    await this.authz.assertCommentAuthorOrAdmin(userId, comment);

    return this.prisma.comment.update({
      where: { id },
      data: dto,
    });
  }

  async softDelete(id: string, userId: string): Promise<CommentResponseDto> {
    // One query: access check and caller role; no extra membership lookup
    const comment = await this.authz.assertCommentAccess(userId, id);
    await this.authz.assertCommentAuthorOrAdmin(userId, comment);

    const { updated, stored } = await this.prisma.$transaction(async (tx) => {
      const stored = await this.attachmentsService.detachFor(tx, {
        commentIds: [id],
      });
      const updated = await tx.comment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return { updated, stored };
    });

    await this.attachmentsService.purgeObjects(stored);

    return updated;
  }
}
