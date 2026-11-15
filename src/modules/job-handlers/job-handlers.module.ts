import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { JobHandlers } from "./job-handlers.service";

/** INT-3: registers the handlers bundles exported with the jobs frame (global, from B06) and schedules the recurring ones. */
@Module({ imports: [PaymentsModule, StoredFilesModule], providers: [JobHandlers], exports: [JobHandlers] })
export class JobHandlersModule {}
