import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { AdminService } from "../admin/admin.service";
import { TheMembersService } from "../integrations/themembers.service";
import { DataRetentionService } from "../integrations/data-retention.service";
import { PerformanceMetricsService } from "../observability/performance-metrics.service";
import { VideoAssetLifecycleService } from "../video/video-asset-lifecycle.service";
import { AcademyJob, type AcademyJobName, type AcademyJobPayloads } from "./jobs.types";

@Injectable()
export class JobProcessorService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly metrics: PerformanceMetricsService,
  ) {}

  async execute<N extends AcademyJobName>(name: N, payload: AcademyJobPayloads[N]) {
    const started = performance.now();
    this.metrics.recordJobStarted(name);
    try {
      const result = await this.run(name, payload);
      this.metrics.recordJobCompleted(name, performance.now() - started);
      return result;
    } catch (error) {
      this.metrics.recordJobFailed(name, performance.now() - started);
      throw error;
    }
  }

  private run<N extends AcademyJobName>(name: N, payload: AcademyJobPayloads[N]): Promise<unknown> {
    if (name === AcademyJob.STUDENTS_IMPORT) {
      return this.moduleRef.get(AdminService, { strict: false }).importStudents(payload as AcademyJobPayloads["students.import"]);
    }
    if (name === AcademyJob.THEMEMBERS_COURSE_SYNC) {
      return this.moduleRef.get(TheMembersService, { strict: false }).importRemoteCourse((payload as AcademyJobPayloads["themembers.course.sync"]).externalId);
    }
    if (name === AcademyJob.THEMEMBERS_PRODUCTS_SYNC) {
      return this.moduleRef.get(TheMembersService, { strict: false }).syncProducts();
    }
    if (name === AcademyJob.THEMEMBERS_ENROLLMENT_SYNC) {
      return this.moduleRef.get(TheMembersService, { strict: false }).processClaimedWebhookEvent((payload as AcademyJobPayloads["themembers.enrollment.sync"]).eventId);
    }
    if (name === AcademyJob.THEMEMBERS_RECONCILE) {
      return this.moduleRef.get(TheMembersService, { strict: false }).reconcileBackgroundState();
    }
    if (name === AcademyJob.VIDEO_ASSET_CLEANUP) {
      return this.moduleRef.get(VideoAssetLifecycleService, { strict: false }).cleanupOrphans();
    }
    if (name === AcademyJob.DATA_RETENTION_CLEANUP) {
      return this.moduleRef.get(DataRetentionService, { strict: false }).cleanup();
    }
    return Promise.reject(new Error(`Job não suportado: ${String(name)}`));
  }
}
