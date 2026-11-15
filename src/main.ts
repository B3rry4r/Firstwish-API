import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { EnvError, loadEnv } from "./common/env/env";
import { AppModule } from "./app.module";
import { setupApp } from "./app.setup";

async function bootstrap(): Promise<void> {
  let port: number;
  try {
    port = loadEnv().PORT; // fail before anything else starts, naming each bad variable
  } catch (e) {
    if (e instanceof EnvError) {
      process.stderr.write(e.message + "\n");
      process.exit(1);
    }
    throw e;
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  setupApp(app);
  app.enableShutdownHooks();
  await app.listen(port);
  process.stdout.write(`Firstwish API listening on port ${port}\n`);
}

void bootstrap();
