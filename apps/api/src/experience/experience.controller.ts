import { Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { ExperienceService } from "./experience.service";

@Controller("experience")
export class ExperienceController {
  constructor(private readonly experience: ExperienceService) {}

  @Get("home")
  home(@Req() req: AuthenticatedRequest) {
    return this.experience.home(req.user.sub);
  }

  @Get("library")
  library(@Req() req: AuthenticatedRequest, @Query("page") page?: string, @Query("limit") limit?: string, @Query("favoritePage") favoritePage?: string) {
    return this.experience.library(req.user.sub, page, limit, favoritePage);
  }

  @Get("catalog")
  catalog(
    @Req() req: AuthenticatedRequest,
    @Query("q") q?: string,
    @Query("category") category?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.experience.catalog(req.user.sub, q, category, page, limit);
  }

  @Get("paths")
  paths(@Req() req: AuthenticatedRequest) {
    return this.experience.paths(req.user.sub);
  }

  @Get("paths/:slug")
  path(@Req() req: AuthenticatedRequest, @Param("slug") slug: string) {
    return this.experience.pathBySlug(req.user.sub, slug);
  }

  @Get("courses/:slug")
  course(@Req() req: AuthenticatedRequest, @Param("slug") slug: string) {
    return this.experience.course(req.user.sub, slug);
  }

  @Get("lessons/:lessonId/resources")
  lessonResources(@Req() req: AuthenticatedRequest, @Param("lessonId") lessonId: string) {
    return this.experience.lessonResources(req.user.sub, req.user.role, lessonId);
  }


  @Get("notifications")
  notifications(@Req() req: AuthenticatedRequest) { return this.experience.notifications(req.user.sub); }

  @Get("notifications/summary")
  notificationSummary(@Req() req: AuthenticatedRequest) { return this.experience.notificationSummary(req.user.sub); }

  @Post("notifications/read-all")
  readAllNotifications(@Req() req: AuthenticatedRequest) { return this.experience.markAllNotificationsRead(req.user.sub); }

  @Post("notifications/:id/read")
  readNotification(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.experience.markNotificationRead(req.user.sub, id); }

  @Get("history")
  history(@Req() req: AuthenticatedRequest) {
    return this.experience.history(req.user.sub);
  }

  @Get("certificates")
  certificates(@Req() req: AuthenticatedRequest) {
    return this.experience.certificates(req.user.sub);
  }

  @Get("certificates/:code")
  certificate(@Req() req: AuthenticatedRequest, @Param("code") code: string) {
    return this.experience.certificate(req.user.sub, code);
  }

  @Post("favorites/:courseId")
  favorite(@Req() req: AuthenticatedRequest, @Param("courseId") courseId: string) {
    return this.experience.favorite(req.user.sub, courseId);
  }

  @Delete("favorites/:courseId")
  unfavorite(@Req() req: AuthenticatedRequest, @Param("courseId") courseId: string) {
    return this.experience.unfavorite(req.user.sub, courseId);
  }
}
