import {
  UseGuards,
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Delete,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CommentsService } from './comments.service';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ApiOperation } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard)
@Controller('comments')
export class CommentController {
  constructor(private commentsService: CommentsService) { }

  @ApiOperation({ summary: 'Get a comment by ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commentsService.findOne(id);
  }

  @ApiOperation({ summary: 'Update a comment by ID' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCommentDto) {
    return this.commentsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Soft delete a comment by ID' })
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.commentsService.softDelete(id);
  }
}
