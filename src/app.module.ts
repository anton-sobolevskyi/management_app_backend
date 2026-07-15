import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.ts";
import { PrismaService } from "./prisma.service.ts";

@Module({
  imports: [],
  controllers: [
    AppController,
  ],
  providers: [
    PrismaService,
  ],
})
export class AppModule {}
