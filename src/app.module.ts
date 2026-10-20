import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { CommentsModule } from './comments/comments.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuthorizationModule } from './common/authorization/authorization.module';
import { AppController } from './app/app.controller';
import { AppService } from './app/app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthorizationModule,
    UsersModule,
    AuthModule,
    ProjectsModule,
    TasksModule,
    CommentsModule,
    AttachmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
