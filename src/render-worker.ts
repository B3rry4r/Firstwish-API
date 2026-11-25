import "reflect-metadata";
import { createServer } from "node:http";
import { NestFactory } from "@nestjs/core";
import { EnvError, loadEnv } from "./common/env/env";
import { AppModule } from "./app.module";
import { RenderWorker } from "./modules/render-jobs/render-worker.service";

/**
 * R6: the video maker's own process (PROCESS_ROLE=render-worker; `npm run start:render-worker`). It takes ONLY render jobs and serves no request but a health address
 * (127.0.0.1:RENDER_WORKER_PORT, GET /health). The web process (PROCESS_ROLE=web) takes no render job, so a render's memory is never the web's.
 */
async function bootstrap(): Promise<void> {
  process.env.PROCESS_ROLE = "render-worker";
  let port: number;
  try {
    port = loadEnv().RENDER_WORKER_PORT;
  } catch (e) {
    if (e instanceof EnvError) {
      process.stderr.write(e.message + "\n");
      process.exit(1);
    }
    throw e;
  }
  const app = await NestFactory.createApplicationContext(AppModule, {});
  app.enableShutdownHooks();
  const worker = app.get(RenderWorker);
  const health = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true, ...worker.status() }));
      return;
    }
    res.writeHead(404).end();
  });
  health.listen(port, "127.0.0.1");
  process.stdout.write(`Firstwish render worker: health on 127.0.0.1:${port}\n`);
}

void bootstrap();
