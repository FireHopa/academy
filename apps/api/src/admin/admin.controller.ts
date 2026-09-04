import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminGuard } from "../auth/auth.guard";
import { AdminService } from "./admin.service";
import { VideoService } from "../video/video.service";
import { CreateCourseDto, UpdateCourseDto } from "./dto/course.dto";
import { CreateLessonDto, UpdateLessonDto } from "./dto/lesson.dto";
import { CreateModuleDto, ReorderDto } from "./dto/module.dto";
import { CourseCategoriesDto, CreateCategoryDto, CreateLearningPathDto, PathCoursesDto, UpdateLearningPathDto } from "./dto/organization.dto";
import { LessonContentDto } from "./dto/content.dto";
import { CreateStudentDto, GrantEnrollmentDto, ImportStudentsDto, SendNotificationDto, StudentStatusDto, UpdateEnrollmentDto } from "./dto/student.dto";
import { AttachPandaVideoDto } from "../video/dto/panda-video.dto";
import { MAX_IMAGE_UPLOAD_BYTES, type UploadedImageFile } from "../media/image-storage.service";
import { createHash } from "node:crypto";
import { AcademyJob, type DispatchResult } from "../jobs/jobs.types";
import { JobQueueService } from "../jobs/job-queue.service";
import { AuditAction } from "../audit/audit.decorator";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly video: VideoService,
    private readonly jobs: JobQueueService,
  ) {}

  @Get("dashboard") dashboard() { return this.admin.dashboard(); }

  @Get("students") listStudents(@Query("q") q?: string, @Query("status") status?: string, @Query("page") page?: string) { return this.admin.listStudents(q, status, Number(page || 1)); }
  @AuditAction({ action: "student.create", entityType: "STUDENT", entityIdResultPath: "user.id", snapshot: true })
  @Post("students") createStudent(@Body() body: CreateStudentDto) { return this.admin.createStudent(body); }
  @AuditAction({ action: "student.import.requested", entityType: "STUDENT_IMPORT", captureRequest: false })
  @Post("students/import")
  async importStudents(@Body() body: ImportStudentsDto) {
    const digest = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 24);
    return this.presentDispatch(await this.jobs.dispatch(AcademyJob.STUDENTS_IMPORT, body, { jobId: `students-import-${digest}` }));
  }
  @AuditAction({ action: "student.invite.generate", entityType: "STUDENT", entityIdParam: "id" })
  @Post("students/:id/invite") generateStudentInvite(@Param("id") id: string, @Query("send") send?: string) { return this.admin.generateStudentInvite(id, send === "1" || send === "true"); }
  @Get("students/:id") getStudent(@Param("id") id: string) { return this.admin.getStudent(id); }
  @AuditAction({ action: "student.status.update", entityType: "STUDENT", entityIdParam: "id", snapshot: true })
  @Patch("students/:id/status") updateStudentStatus(@Param("id") id: string, @Body() body: StudentStatusDto) { return this.admin.updateStudentStatus(id, body); }
  @AuditAction({ action: "enrollment.create", entityType: "ENROLLMENT", entityIdResultPath: "id", snapshot: true })
  @Post("students/:id/enrollments") grantEnrollment(@Param("id") id: string, @Body() body: GrantEnrollmentDto) { return this.admin.grantEnrollment(id, body); }
  @AuditAction({ action: "enrollment.update", entityType: "ENROLLMENT", entityIdParam: "enrollmentId", snapshot: true })
  @Patch("students/:id/enrollments/:enrollmentId") updateEnrollment(@Param("id") id: string, @Param("enrollmentId") enrollmentId: string, @Body() body: UpdateEnrollmentDto) { return this.admin.updateEnrollment(id, enrollmentId, body); }
  @AuditAction({ action: "enrollment.cancel", entityType: "ENROLLMENT", entityIdParam: "enrollmentId", snapshot: true })
  @Delete("students/:id/enrollments/:enrollmentId") cancelEnrollment(@Param("id") id: string, @Param("enrollmentId") enrollmentId: string) { return this.admin.cancelEnrollment(id, enrollmentId); }
  @AuditAction({ action: "student.notification.send", entityType: "STUDENT", entityIdParam: "id", captureRequest: false, captureResult: false })
  @Post("students/:id/notifications") sendNotification(@Param("id") id: string, @Body() body: SendNotificationDto) { return this.admin.sendNotification(id, body); }
  @AuditAction({ action: "student.device.revoke", entityType: "DEVICE", entityIdParam: "deviceId", snapshot: true })
  @Delete("students/:id/devices/:deviceId") revokeStudentDevice(@Param("id") id: string, @Param("deviceId") deviceId: string) { return this.admin.revokeStudentDevice(id, deviceId); }
  @AuditAction({ action: "student.session.end", entityType: "WATCH_SESSION", entityIdParam: "sessionId", snapshot: true })
  @Post("students/:id/sessions/:sessionId/end") endStudentSession(@Param("id") id: string, @Param("sessionId") sessionId: string) { return this.admin.endStudentSession(id, sessionId); }

  @Get("courses") listCourses() { return this.admin.listCourses(); }
  @AuditAction({ action: "course.create", entityType: "COURSE", entityIdResultPath: "id", snapshot: true })
  @Post("courses") createCourse(@Body() body: CreateCourseDto) { return this.admin.createCourse(body); }
  @Get("courses/:id") getCourse(@Param("id") id: string) { return this.admin.getCourse(id); }
  @AuditAction({ action: "course.update", entityType: "COURSE", entityIdParam: "id", snapshot: true })
  @Patch("courses/:id") updateCourse(@Param("id") id: string, @Body() body: UpdateCourseDto) { return this.admin.updateCourse(id, body); }
  @AuditAction({ action: "course.delete", entityType: "COURSE", entityIdParam: "id", snapshot: true, deleted: true })
  @Delete("courses/:id") deleteCourse(@Param("id") id: string) { return this.admin.deleteCourse(id); }
  @AuditAction({ action: "course.image.upload", entityType: "COURSE", entityIdParam: "id", snapshot: true, captureRequest: false })
  @Post("courses/:id/images/:kind")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES, files: 1 } }))
  uploadCourseImage(@Param("id") id: string, @Param("kind") kind: string, @UploadedFile() file?: UploadedImageFile) {
    return this.admin.uploadCourseImage(id, kind, file);
  }
  @AuditAction({ action: "course.image.remove", entityType: "COURSE", entityIdParam: "id", snapshot: true })
  @Delete("courses/:id/images/:kind")
  removeCourseImage(@Param("id") id: string, @Param("kind") kind: string) { return this.admin.removeCourseImage(id, kind); }
  @AuditAction({ action: "course.module.create", entityType: "COURSE_MODULE", entityIdResultPath: "id", snapshot: true })
  @Post("courses/:id/modules") createModule(@Param("id") id: string, @Body() body: CreateModuleDto) { return this.admin.createModule(id, body.title); }
  @AuditAction({ action: "course.modules.reorder", entityType: "COURSE_MODULE_ORDER", entityIdParam: "id", snapshot: true })
  @Put("courses/:id/modules/reorder") reorderModules(@Param("id") id: string, @Body() body: ReorderDto) { return this.admin.reorderModules(id, body.items); }
  @AuditAction({ action: "course.module.update", entityType: "COURSE_MODULE", entityIdParam: "id", snapshot: true })
  @Patch("modules/:id") updateModule(@Param("id") id: string, @Body() body: CreateModuleDto) { return this.admin.updateModule(id, body.title); }
  @AuditAction({ action: "course.module.delete", entityType: "COURSE_MODULE", entityIdParam: "id", snapshot: true, deleted: true })
  @Delete("modules/:id") deleteModule(@Param("id") id: string) { return this.admin.deleteModule(id); }
  @AuditAction({ action: "lesson.create", entityType: "LESSON", entityIdResultPath: "id", snapshot: true })
  @Post("modules/:id/lessons") createLesson(@Param("id") id: string, @Body() body: CreateLessonDto) { return this.admin.createLesson(id, body); }
  @AuditAction({ action: "lessons.reorder", entityType: "MODULE_LESSON_ORDER", entityIdParam: "id", snapshot: true })
  @Put("modules/:id/lessons/reorder") reorderLessons(@Param("id") id: string, @Body() body: ReorderDto) { return this.admin.reorderLessons(id, body.items); }
  @AuditAction({ action: "lesson.update", entityType: "LESSON", entityIdParam: "id", snapshot: true })
  @Patch("lessons/:id") updateLesson(@Param("id") id: string, @Body() body: UpdateLessonDto) { return this.admin.updateLesson(id, body); }
  @AuditAction({ action: "lesson.delete", entityType: "LESSON", entityIdParam: "id", snapshot: true, deleted: true })
  @Delete("lessons/:id") deleteLesson(@Param("id") id: string) { return this.admin.deleteLesson(id); }
  @Get("lessons/:id/content") lessonContent(@Param("id") id: string) { return this.admin.getLessonContent(id); }
  @AuditAction({ action: "lesson.content.update", entityType: "LESSON_CONTENT", entityIdParam: "id", snapshot: true })
  @Put("lessons/:id/content") saveLessonContent(@Param("id") id: string, @Body() body: LessonContentDto) { return this.admin.saveLessonContent(id, body); }
  @Get("categories") listCategories() { return this.admin.listCategories(); }
  @AuditAction({ action: "category.create", entityType: "CATEGORY", entityIdResultPath: "id", snapshot: true })
  @Post("categories") createCategory(@Body() body: CreateCategoryDto) { return this.admin.createCategory(body.name); }
  @AuditAction({ action: "course.categories.update", entityType: "COURSE", entityIdParam: "id", snapshot: true })
  @Put("courses/:id/categories") setCourseCategories(@Param("id") id: string, @Body() body: CourseCategoriesDto) { return this.admin.setCourseCategories(id, body.categoryIds); }
  @Get("paths") listPaths() { return this.admin.listPaths(); }
  @AuditAction({ action: "learning-path.create", entityType: "LEARNING_PATH", entityIdResultPath: "id", snapshot: true })
  @Post("paths") createPath(@Body() body: CreateLearningPathDto) { return this.admin.createPath(body); }
  @AuditAction({ action: "learning-path.update", entityType: "LEARNING_PATH", entityIdParam: "id", snapshot: true })
  @Patch("paths/:id") updatePath(@Param("id") id: string, @Body() body: UpdateLearningPathDto) { return this.admin.updatePath(id, body); }
  @AuditAction({ action: "learning-path.image.upload", entityType: "LEARNING_PATH", entityIdParam: "id", snapshot: true, captureRequest: false })
  @Post("paths/:id/image")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES, files: 1 } }))
  uploadPathImage(@Param("id") id: string, @UploadedFile() file?: UploadedImageFile) { return this.admin.uploadPathImage(id, file); }
  @AuditAction({ action: "learning-path.image.remove", entityType: "LEARNING_PATH", entityIdParam: "id", snapshot: true })
  @Delete("paths/:id/image") removePathImage(@Param("id") id: string) { return this.admin.removePathImage(id); }
  @AuditAction({ action: "learning-path.courses.update", entityType: "LEARNING_PATH", entityIdParam: "id", snapshot: true })
  @Put("paths/:id/courses") setPathCourses(@Param("id") id: string, @Body() body: PathCoursesDto) { return this.admin.setPathCourses(id, body.items); }
  @AuditAction({ action: "learning-path.delete", entityType: "LEARNING_PATH", entityIdParam: "id", snapshot: true, deleted: true })
  @Delete("paths/:id") deletePath(@Param("id") id: string) { return this.admin.deletePath(id); }
  @AuditAction({ action: "lesson.video.upload.create", entityType: "LESSON", entityIdParam: "id", snapshot: true, captureRequest: false })
  @Post("lessons/:id/video/upload") createVideoUpload(@Param("id") id: string) { return this.video.createDirectUpload(id); }
  @AuditAction({ action: "lesson.video.panda.attach", entityType: "LESSON", entityIdParam: "id", snapshot: true })
  @Post("lessons/:id/video/panda/attach") attachPandaVideo(@Param("id") id: string, @Body() body: AttachPandaVideoDto) { return this.video.attachPandaVideo(id, body.videoId); }
  @AuditAction({ action: "lesson.video.panda.refresh", entityType: "LESSON", entityIdParam: "id", snapshot: true, captureRequest: false })
  @Post("lessons/:id/video/panda/refresh") refreshPandaVideo(@Param("id") id: string) { return this.video.refreshPandaVideo(id); }
  @Get("lessons/:id/video/status") videoStatus(@Param("id") id: string) { return this.video.getAdminVideoStatus(id); }
  @AuditAction({ action: "lesson.video.remove", entityType: "LESSON", entityIdParam: "id", snapshot: true })
  @Delete("lessons/:id/video") removeVideo(@Param("id") id: string) { return this.video.removeVideo(id); }

  private presentDispatch(result: DispatchResult) {
    if (result.mode === "inline") return result.result;
    return { ok: true, queued: true, queue: result.queue, jobId: result.jobId, status: result.state };
  }
}
