import { Controller, Get, HttpStatus } from "@nestjs/common";
import { Public } from "../common/auth/decorators";
import { AppError } from "../common/errors/app-error";
import { Health, HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * 200 { status: "ok", db, redis, version } when the database and Redis answer.
   * Otherwise 503 in the error envelope, naming what is down (Default (lead), owner may override: a load balancer
   * takes an instance out of rotation on a non-200).
   */
  @Public()
  @Get()
  async get(): Promise<Health> {
    const h = await this.health.check();
    if (h.status === "ok") return h;
    const down = [h.db !== "ok" ? `database ${h.db}` : null, h.redis !== "ok" ? "redis down" : null].filter(Boolean).join(", ");
    throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, "service_unavailable", `Not ready: ${down}.`, {
      db: h.db,
      redis: h.redis,
      version: h.version,
    });
  }
}
