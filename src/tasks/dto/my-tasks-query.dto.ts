import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class MyTasksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Also return tasks in status DONE',
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  includeDone?: boolean;
}
