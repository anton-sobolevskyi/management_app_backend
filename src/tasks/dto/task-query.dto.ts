import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { TaskStatus } from '../../generated/prisma/enums';

export class TaskQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Only tasks assigned to this user ID' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive title/description search',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description:
      'ISO 8601. Inclusive. A date without time means the end of that day (UTC).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueBefore?: string;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00Z',
    description: 'ISO 8601. Inclusive lower bound.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueAfter?: string;
}
