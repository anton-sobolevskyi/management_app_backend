import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Deep offsets force the database to skip that many rows: cap them. */
export const MAX_PAGE = 10_000;

export class PaginationQueryDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: MAX_PAGE,
    description:
      'Offset pagination gets slower the deeper you go, so the page number is capped.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class PaginationMetaDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class PaginatedResponseDto<T> {
  data: T[];
  meta: PaginationMetaDto;
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponseDto<T> {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    },
  };
}

export function paginationArgs(query: PaginationQueryDto): {
  page: number;
  limit: number;
  skip: number;
} {
  const page =
    query.page && query.page > 0 ? Math.min(query.page, MAX_PAGE) : 1;
  const limit =
    query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
  return { page, limit, skip: (page - 1) * limit };
}
