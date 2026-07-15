import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.ts";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const rawPort = (Deno.env.get("PORT") ?? "").trim();
  const parsedPort = rawPort.length > 0 ? Number(rawPort) : Number.NaN;
  const port =
    Number.isFinite(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 3000;
  await app.listen(port, "0.0.0.0");
  console.log(`Server running at http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  Deno.exit(1);
});
