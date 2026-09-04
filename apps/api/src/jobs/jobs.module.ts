import { Global, Module } from "@nestjs/common";
import { ObservabilityModule } from "../observability/observability.module";
import { JOB_DISPATCHER } from "./jobs.types";
import { JobProcessorService } from "./job-processor.service";
import { JobQueueService } from "./job-queue.service";
import { JobWorkerService } from "./job-worker.service";
import { JobsController } from "./jobs.controller";

@Global()
@Module({
  imports: [ObservabilityModule],
  controllers: [JobsController],
  providers: [
    JobProcessorService,
    JobQueueService,
    JobWorkerService,
    { provide: JOB_DISPATCHER, useExisting: JobQueueService },
  ],
  exports: [JobQueueService, JobWorkerService, JOB_DISPATCHER],
})
export class JobsModule {}
