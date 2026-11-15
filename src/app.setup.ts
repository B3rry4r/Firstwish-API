import { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ENV } from "./common/env/env.module";
import type { Env } from "./common/env/env";
import { ErrorEnvelopeFilter } from "./common/errors/error-envelope.filter";
import { requestIdMiddleware } from "./common/http/request-id";
import { makeValidationPipe } from "./common/validation/validation.pipe";

export const API_PREFIX = "v1";

/**
 * Everything the app needs before it serves: request ids, prefix /v1, the validation pipe, the error envelope and CORS.
 * main.ts and the test kit both call this, so tests run the same app the server runs.
 * Create the app with { rawBody: true } so webhook signatures can be checked.
 */
export function setupApp(app: INestApplication): INestApplication {
  const env = app.get<Env>(ENV);
  const express = app as NestExpressApplication;
  express.disable("x-powered-by");
  express.set("trust proxy", 1);
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(makeValidationPipe());
  app.useGlobalFilters(new ErrorEnvelopeFilter());
  app.enableCors({
    origin: env.WEB_ORIGINS,
    credentials: true,
    exposedHeaders: ["x-request-id"],
  });
  return app;
}
