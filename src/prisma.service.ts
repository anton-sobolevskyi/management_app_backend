import { Injectable } from "@nestjs/common";
import { PrismaClient } from "./generated/prisma/client.ts";
import { prismaClientOptions } from "./lib/prisma.ts";

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super(prismaClientOptions);
  }
}
