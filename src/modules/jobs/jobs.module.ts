import { Global, Module } from "@nestjs/common";
import { JobsService } from "./jobs.service";

/** The jobs frame (B06): `jobs.schedule(kind, at, key)` and `jobs.register(kind, handler)` for every bundle with timed work. */
@Global()
@Module({ providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
