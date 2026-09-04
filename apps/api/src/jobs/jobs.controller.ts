import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/auth.guard";
import { JobQueueService } from "./job-queue.service";

@Controller("admin/jobs")
@UseGuards(AdminGuard)
export class JobsController {
  constructor(private readonly jobs: JobQueueService) {}

  @Get()
  overview() {
    return this.jobs.overview();
  }

  @Get(":id")
  status(@Param("id") id: string) {
    return this.jobs.status(id);
  }
}
