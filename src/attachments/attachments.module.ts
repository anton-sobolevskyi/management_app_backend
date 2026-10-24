import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { S3OrphanSweeperService } from './s3-orphan-sweeper.service';
import { S3Module } from '../s3/s3.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [S3Module, PrismaModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, S3OrphanSweeperService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
