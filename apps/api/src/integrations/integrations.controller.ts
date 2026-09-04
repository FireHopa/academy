import { Body, Controller, Get, Header, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/auth.guard";
import { VideoService } from "../video/video.service";
import { TheMembersService } from "./themembers.service";
import { ProductCoursesDto, ProductReferenceDto } from "./dto/integration.dto";
import { ListPandaVideosDto } from "../video/dto/panda-video.dto";
import { AcademyJob, type DispatchResult } from "../jobs/jobs.types";
import { JobQueueService } from "../jobs/job-queue.service";
import { AuditAction } from "../audit/audit.decorator";
import { DataRetentionService } from "./data-retention.service";

@Controller("admin/integrations")
@UseGuards(AdminGuard)
export class IntegrationsController {
  constructor(
    private readonly video: VideoService,
    private readonly themembers: TheMembersService,
    private readonly jobs: JobQueueService,
    private readonly retention: DataRetentionService,
  ) {}

  @Get("status") async status() {
    return { video: await this.video.providerStatus(), themembers: this.themembers.status() };
  }

  @AuditAction({ action: "integration.panda.test", entityType: "INTEGRATION", captureRequest: false })
  @Post("panda/test") testPanda() { return this.video.testPanda(); }
  @Get("panda/diagnostics")
  @Header("Cache-Control", "no-store, private")
  pandaDiagnostics() { return this.video.pandaDiagnostics(); }
  @Get("panda/videos") pandaVideos(@Query() query: ListPandaVideosDto) {
    return this.video.listPandaVideos(query.page, query.title ?? "", query.status ?? "");
  }
  @Get("video-assets/lifecycle")
  @Header("Cache-Control", "no-store, private")
  videoAssetLifecycle() { return this.video.videoAssetLifecycleStatus(); }
  @AuditAction({ action: "video-assets.cleanup.requested", entityType: "VIDEO_ASSET_CLEANUP", captureRequest: false })
  @Post("video-assets/cleanup")
  async cleanupVideoAssets() {
    return this.presentDispatch(await this.jobs.dispatch(AcademyJob.VIDEO_ASSET_CLEANUP, {}, { jobId: `video-assets-cleanup-${Date.now()}` }));
  }

  @Get("data-retention")
  @Header("Cache-Control", "no-store, private")
  dataRetentionStatus() { return this.retention.status(); }
  @AuditAction({ action: "data-retention.cleanup.requested", entityType: "DATA_RETENTION", captureRequest: false })
  @Post("data-retention/cleanup")
  async cleanupRetainedData() {
    return this.presentDispatch(await this.jobs.dispatch(AcademyJob.DATA_RETENTION_CLEANUP, {}, { jobId: `data-retention-cleanup-${Date.now()}` }));
  }

  @AuditAction({ action: "integration.themembers.test", entityType: "INTEGRATION", captureRequest: false })
  @Post("themembers/test") testTheMembers() { return this.themembers.testConnection(); }
  @Get("themembers/courses") courses() { return this.themembers.listRemoteCourses(); }
  @AuditAction({ action: "integration.themembers.course-import.requested", entityType: "REMOTE_COURSE", entityIdParam: "courseId", captureRequest: false })
  @Post("themembers/courses/:courseId/import")
  async importCourse(@Param("courseId") courseId: string) {
    return this.presentDispatch(await this.jobs.dispatch(AcademyJob.THEMEMBERS_COURSE_SYNC, { externalId: courseId }, { jobId: `themembers-course-${courseId}` }));
  }
  @AuditAction({ action: "integration.themembers.products-sync.requested", entityType: "INTEGRATION", captureRequest: false })
  @Post("themembers/sync-products")
  async syncProducts() {
    return this.presentDispatch(await this.jobs.dispatch(AcademyJob.THEMEMBERS_PRODUCTS_SYNC, {}, { jobId: `themembers-products-${Date.now()}` }));
  }
  @AuditAction({ action: "integration.themembers.reconcile.requested", entityType: "INTEGRATION", captureRequest: false })
  @Post("themembers/reconcile")
  async reconcile() {
    return this.presentDispatch(await this.jobs.dispatch(AcademyJob.THEMEMBERS_RECONCILE, {}, { jobId: `themembers-reconcile-${Date.now()}` }));
  }
  @Get("themembers/products") products() { return this.themembers.listProducts(); }
  @AuditAction({ action: "integration.themembers.product-courses.update", entityType: "EXTERNAL_PRODUCT", entityIdParam: "id", snapshot: true })
  @Put("themembers/products/:id/courses") mapCourses(@Param("id") id: string, @Body() body: ProductCoursesDto) { return this.themembers.setProductCourses(id, body.courseIds); }
  @AuditAction({ action: "integration.themembers.reference.update", entityType: "EXTERNAL_PRODUCT", entityIdParam: "id", snapshot: true })
  @Put("themembers/products/:id/reference") setReference(@Param("id") id: string, @Body() body: ProductReferenceDto) { return this.themembers.setCheckoutReference(id, body.checkoutReferenceId); }
  @Get("themembers/events") events(@Query("limit") limit?: string) { return this.themembers.listEvents(Number(limit || 50)); }
  @Get("logs") logs(@Query("limit") limit?: string) { return this.themembers.listLogs(Number(limit || 50)); }

  private presentDispatch(result: DispatchResult) {
    if (result.mode === "inline") return result.result;
    return { ok: true, queued: true, queue: result.queue, jobId: result.jobId, status: result.state };
  }
}
