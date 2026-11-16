import { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ENV } from "./common/env/env.module";
import type { Env } from "./common/env/env";
import { ErrorEnvelopeFilter } from "./common/errors/error-envelope.filter";
import { requestIdMiddleware } from "./common/http/request-id";
import { WireJsonInterceptor, wireReplacer } from "./common/http/wire-json";
import { ControlCharsPipe } from "./common/validation/control-chars.pipe";
import { makeValidationPipe } from "./common/validation/validation.pipe";

export const API_PREFIX = "v1";

/**
 * Everything the app needs before it serves: request ids, prefix /v1, the validation pipe, the error envelope, money on the
 * wire as JSON integers (every BigInt a safe number, Q2) and CORS.
 * main.ts and the test kit both call this, so tests run the same app the server runs.
 * Create the app with { rawBody: true } so webhook signatures can be checked.
 */
export function setupApp(app: INestApplication): INestApplication {
  const env = app.get<Env>(ENV);
  const express = app as NestExpressApplication;
  express.disable("x-powered-by");
  // V4: the client address is read past exactly TRUST_PROXY_HOPS trusted proxies; 0 (default) reads the socket address.
  express.set("trust proxy", env.TRUST_PROXY_HOPS);
  express.set("json replacer", wireReplacer);
  // JJ1: the JSON body limit is a config value (512 KB by default), above the wish content limit (256 KB), so an oversize wish
  // reaches the service and gets its 422 with the reason, not a bare 413 from the parser. The raw body stays kept for webhooks.
  express.useBodyParser("json", { limit: env.JSON_BODY_LIMIT_BYTES });
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(API_PREFIX);
  // AA3: control characters are refused (422) before validation, for every body, query and path value.
  app.useGlobalPipes(new ControlCharsPipe(), makeValidationPipe());
  app.useGlobalInterceptors(new WireJsonInterceptor());
  app.useGlobalFilters(new ErrorEnvelopeFilter());
  app.enableCors({
    origin: env.WEB_ORIGINS,
    credentials: true,
    exposedHeaders: ["x-request-id"],
  });
  return app;
}
