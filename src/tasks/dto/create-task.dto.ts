import {
  IsString,
  IsOptional,
  IsEnum,
  IsISO8601,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from '../../generated/prisma/enums';

export class CreateTaskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-10-31T17:00:00Z',
    description:
      'ISO 8601 date or date-time; include a Z or UTC offset. Without an offset the server interprets the time in its own timezone. On update, null clears the due date.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Project member to assign. On update, null unassigns.',
  })
  @IsOptional()
  @IsString()
  assignedToId?: string | null;
}
