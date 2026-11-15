import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { HealthModule } from "./health/health.module";

/** Registration entry: each resource module adds one import line here. */
@Module({
  imports: [CommonModule, HealthModule],
})
export class AppModule {}
