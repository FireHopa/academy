import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { hash } from "bcryptjs";
import { AuthService } from "../auth/auth.service";
import type { CreateCourseDto, UpdateCourseDto } from "./dto/course.dto";
import type { CreateLessonDto, UpdateLessonDto } from "./dto/lesson.dto";
import type { CreateLearningPathDto, UpdateLearningPathDto } from "./dto/organization.dto";
import type { LessonContentDto } from "./dto/content.dto";
import type { CreateStudentDto, GrantEnrollmentDto, ImportStudentsDto, SendNotificationDto, StudentStatusDto, UpdateEnrollmentDto } from "./dto/student.dto";
import { ImageStorageService, type ImagePreset, type UploadedImageFile } from "../media/image-storage.service";
import { SessionCacheService } from "../redis/session-cache.service";
import { VideoAssetLifecycleService } from "../video/video-asset-lifecycle.service";
import { isValidCpf, normalizeCpf } from "../common/cpf";

function slugify(input: string) {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Optional() private readonly images?: ImageStorageService,
    @Optional() private readonly sessionCache?: SessionCacheService,
    @Optional() private readonly videoLifecycle?: VideoAssetLifecycleService,
  ) {}

  async dashboard() {
    const [students, courses, lessons, publishedCourses] = await Promise.all([
      this.prisma.user.count({ where: { role: "STUDENT" } }),
      this.prisma.course.count(),
      this.prisma.lesson.count(),
      this.prisma.course.count({ where: { status: "PUBLISHED" } }),
    ]);
    return { students, courses, lessons, publishedCourses };
  }

  listCourses() {
    return this.prisma.course.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        categories: { select: { id: true, name: true, slug: true } },
        _count: { select: { enrollments: true, modules: true } },
        modules: { select: { _count: { select: { lessons: true } } } },
      },
    });
  }

  async createCourse(data: CreateCourseDto) {
    const base = slugify(data.title) || "curso";
    let slug = base;
    let suffix = 2;
    while (await this.prisma.course.findUnique({ where: { slug }, select: { id: true } })) slug = `${base}-${suffix++}`;
    return this.prisma.course.create({ data: { ...data, slug } });
  }

  async getCourse(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        categories: { select: { id: true, name: true, slug: true } },
        modules: {
          orderBy: { position: "asc" },
          include: {
            lessons: {
              orderBy: { position: "asc" },
              include: {
                videoResource: {
                  select: { id: true, provider: true, providerAssetId: true, thumbnailUrl: true, status: true, durationSec: true, error: true },
                },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException("Curso não encontrado");
    return course;
  }

  async updateCourse(id: string, data: UpdateCourseDto) {
    const current = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true, status: true, heroImageUrl: true, cardImageUrl: true },
    });
    if (!current) throw new NotFoundException("Curso não encontrado");
    const update: any = { ...data };
    if ("heroImageUrl" in data) update.heroImageUrl = data.heroImageUrl?.trim() || null;
    if ("cardImageUrl" in data) update.cardImageUrl = data.cardImageUrl?.trim() || null;
    if ("certificateTitle" in data) update.certificateTitle = data.certificateTitle?.trim() || null;
    if (data.title) {
      const base = slugify(data.title) || "curso";
      let slug = base;
      let suffix = 2;
      while (true) {
        const existing = await this.prisma.course.findUnique({ where: { slug }, select: { id: true } });
        if (!existing || existing.id === id) break;
        slug = `${base}-${suffix++}`;
      }
      update.slug = slug;
    }
    if (data.status === "PUBLISHED") update.publishedAt = new Date();
    else if (data.status) update.publishedAt = null;
    const updated = await this.prisma.course.update({ where: { id }, data: update });
    if (current.status === "PUBLISHED" && data.status && data.status !== "PUBLISHED") {
      await this.endAllCourseSessions(id, "course_unpublished");
    }
    if ("heroImageUrl" in data && current.heroImageUrl !== updated.heroImageUrl) await this.images?.removeManaged(current.heroImageUrl);
    if ("cardImageUrl" in data && current.cardImageUrl !== updated.cardImageUrl) await this.images?.removeManaged(current.cardImageUrl);
    return updated;
  }

  async deleteCourse(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true, title: true, heroImageUrl: true, cardImageUrl: true },
    });
    if (!course) throw new NotFoundException("Curso não encontrado");

    await this.markVideoAssetsDetached({ module: { courseId: id } });
    await this.prisma.course.delete({ where: { id } });
    await Promise.all([
      this.images?.removeManaged(course.heroImageUrl),
      this.images?.removeManaged(course.cardImageUrl),
    ]);
    return { ok: true, message: `${course.title} foi excluído.`, id: course.id };
  }

  async uploadCourseImage(id: string, kind: string, file?: UploadedImageFile) {
    const options: Record<string, { field: "cardImageUrl" | "heroImageUrl"; preset: ImagePreset }> = {
      card: { field: "cardImageUrl", preset: "course-card" },
      hero: { field: "heroImageUrl", preset: "course-hero" },
    };
    const option = options[kind];
    if (!option) throw new BadRequestException("Tipo de imagem inválido");
    const images = this.requireImageStorage();
    const stored = await images.store(file, option.preset);
    try {
      await this.updateCourse(id, { [option.field]: stored.url } as UpdateCourseDto);
      return stored;
    } catch (error) {
      await images.removeManaged(stored.url);
      throw error;
    }
  }

  async removeCourseImage(id: string, kind: string) {
    const field = kind === "card" ? "cardImageUrl" : kind === "hero" ? "heroImageUrl" : null;
    if (!field) throw new BadRequestException("Tipo de imagem inválido");
    await this.updateCourse(id, { [field]: "" } as UpdateCourseDto);
    return { ok: true, url: null };
  }

  async createModule(courseId: string, title: string) {
    await this.ensureCourse(courseId);
    const last = await this.prisma.courseModule.aggregate({ where: { courseId }, _max: { position: true } });
    return this.prisma.courseModule.create({ data: { courseId, title, position: (last._max.position ?? 0) + 1 } });
  }

  async updateModule(id: string, title: string) {
    await this.ensureModule(id);
    return this.prisma.courseModule.update({ where: { id }, data: { title } });
  }

  async deleteModule(id: string) {
    const module = await this.ensureModule(id);
    await this.markVideoAssetsDetached({ moduleId: id });
    await this.prisma.courseModule.delete({ where: { id } });
    await this.compactModulePositions(module.courseId);
    return { ok: true };
  }

  async reorderModules(courseId: string, items: { id: string; position: number }[]) {
    await this.ensureCourse(courseId);
    const ids = items.map(i => i.id);
    const count = await this.prisma.courseModule.count({ where: { courseId, id: { in: ids } } });
    if (count !== items.length) throw new BadRequestException("Um ou mais módulos não pertencem a este curso");
    await this.prisma.$transaction(async tx => {
      for (let i = 0; i < items.length; i++) await tx.courseModule.update({ where: { id: items[i].id }, data: { position: -(i + 1) } });
      for (const item of items) await tx.courseModule.update({ where: { id: item.id }, data: { position: item.position } });
    });
    return this.getCourse(courseId);
  }

  async createLesson(moduleId: string, data: CreateLessonDto) {
    await this.ensureModule(moduleId);
    const last = await this.prisma.lesson.aggregate({ where: { moduleId }, _max: { position: true } });
    return this.prisma.lesson.create({ data: { moduleId, position: (last._max.position ?? 0) + 1, ...data } });
  }

  async updateLesson(id: string, data: UpdateLessonDto) {
    const current = await this.ensureLesson(id);
    const updated = await this.prisma.lesson.update({ where: { id }, data });
    if (current.published && data.published === false) {
      await this.prisma.watchSession.updateMany({
        where: { lessonId: id, status: "ACTIVE" },
        data: { status: "BLOCKED", blockReason: "lesson_unpublished", endedAt: new Date() },
      });
    }
    return updated;
  }

  async deleteLesson(id: string) {
    const lesson = await this.ensureLesson(id);
    await this.videoLifecycle?.markDetached([lesson.videoResourceId]);
    await this.prisma.lesson.delete({ where: { id } });
    await this.compactLessonPositions(lesson.moduleId);
    return { ok: true };
  }

  async reorderLessons(moduleId: string, items: { id: string; position: number }[]) {
    await this.ensureModule(moduleId);
    const ids = items.map(i => i.id);
    const count = await this.prisma.lesson.count({ where: { moduleId, id: { in: ids } } });
    if (count !== items.length) throw new BadRequestException("Uma ou mais aulas não pertencem a este módulo");
    await this.prisma.$transaction(async tx => {
      for (let i = 0; i < items.length; i++) await tx.lesson.update({ where: { id: items[i].id }, data: { position: -(i + 1) } });
      for (const item of items) await tx.lesson.update({ where: { id: item.id }, data: { position: item.position } });
    });
    return { ok: true };
  }

  async getLessonContent(id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: {
        chapters: { orderBy: { position: "asc" } },
        materials: { orderBy: { position: "asc" } },
        transcript: true,
        module: { include: { course: { select: { id: true, title: true, slug: true } } } },
      },
    });
    if (!lesson) throw new NotFoundException("Aula não encontrada");
    return lesson;
  }

  async saveLessonContent(id: string, data: LessonContentDto) {
    await this.ensureLesson(id);
    const chapters = [...data.chapters];
    if (new Set(chapters.map(chapter => chapter.startSec)).size !== chapters.length) {
      throw new BadRequestException("Dois capítulos não podem começar no mesmo segundo");
    }

    await this.prisma.$transaction(async tx => {
      await tx.lesson.update({ where: { id }, data: { description: data.description ?? "" } });
      await tx.lessonChapter.deleteMany({ where: { lessonId: id } });
      await tx.lessonMaterial.deleteMany({ where: { lessonId: id } });

      for (let index = 0; index < chapters.length; index++) {
        await tx.lessonChapter.create({ data: { lessonId: id, title: chapters[index].title, startSec: chapters[index].startSec, position: index + 1 } });
      }
      for (let index = 0; index < data.materials.length; index++) {
        const material = data.materials[index];
        await tx.lessonMaterial.create({ data: { lessonId: id, title: material.title, type: material.type, url: material.url, position: index + 1 } });
      }

      const transcript = data.transcript?.trim() ?? "";
      if (transcript) {
        await tx.lessonTranscript.upsert({
          where: { lessonId: id },
          update: { content: transcript, language: data.transcriptLanguage || "pt-BR" },
          create: { lessonId: id, content: transcript, language: data.transcriptLanguage || "pt-BR" },
        });
      } else {
        await tx.lessonTranscript.deleteMany({ where: { lessonId: id } });
      }
    });

    return this.getLessonContent(id);
  }


  listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { courses: true } } } });
  }

  async createCategory(name: string) {
    const base = slugify(name) || "categoria";
    let slug = base;
    let suffix = 2;
    while (await this.prisma.category.findUnique({ where: { slug }, select: { id: true } })) slug = `${base}-${suffix++}`;
    return this.prisma.category.create({ data: { name, slug } });
  }

  async setCourseCategories(courseId: string, categoryIds: string[]) {
    await this.ensureCourse(courseId);
    if (categoryIds.length) {
      const count = await this.prisma.category.count({ where: { id: { in: categoryIds } } });
      if (count !== categoryIds.length) throw new BadRequestException("Uma ou mais categorias são inválidas");
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: { categories: { set: categoryIds.map(id => ({ id })) } },
      include: { categories: true },
    });
  }

  listPaths() {
    return this.prisma.learningPath.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { courses: { orderBy: { position: "asc" }, include: { course: { select: { id: true, title: true, slug: true, status: true } } } } },
    });
  }

  async createPath(data: CreateLearningPathDto) {
    const base = slugify(data.title) || "trilha";
    let slug = base;
    let suffix = 2;
    while (await this.prisma.learningPath.findUnique({ where: { slug }, select: { id: true } })) slug = `${base}-${suffix++}`;
    const max = await this.prisma.learningPath.aggregate({ _max: { position: true } });
    return this.prisma.learningPath.create({ data: { ...data, slug, position: (max._max.position ?? -1) + 1 } });
  }

  async updatePath(id: string, data: UpdateLearningPathDto) {
    const current = await this.prisma.learningPath.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Trilha não encontrada");
    const update: any = { ...data };
    if ("heroImageUrl" in data) update.heroImageUrl = data.heroImageUrl?.trim() || null;
    if (data.title && data.title !== current.title) {
      const base = slugify(data.title) || "trilha";
      let slug = base;
      let suffix = 2;
      while (true) {
        const existing = await this.prisma.learningPath.findUnique({ where: { slug }, select: { id: true } });
        if (!existing || existing.id === id) break;
        slug = `${base}-${suffix++}`;
      }
      update.slug = slug;
    }
    const updated = await this.prisma.learningPath.update({ where: { id }, data: update });
    if ("heroImageUrl" in data && current.heroImageUrl !== updated.heroImageUrl) await this.images?.removeManaged(current.heroImageUrl);
    return updated;
  }

  async uploadPathImage(id: string, file?: UploadedImageFile) {
    const images = this.requireImageStorage();
    const stored = await images.store(file, "path-hero");
    try {
      await this.updatePath(id, { heroImageUrl: stored.url });
      return stored;
    } catch (error) {
      await images.removeManaged(stored.url);
      throw error;
    }
  }

  async removePathImage(id: string) {
    await this.updatePath(id, { heroImageUrl: "" });
    return { ok: true, url: null };
  }

  async setPathCourses(pathId: string, items: { courseId: string; position: number }[]) {
    const path = await this.prisma.learningPath.findUnique({ where: { id: pathId }, select: { id: true } });
    if (!path) throw new NotFoundException("Trilha não encontrada");
    const ids = items.map(item => item.courseId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException("Um curso não pode aparecer duas vezes na mesma trilha");
    if (ids.length) {
      const count = await this.prisma.course.count({ where: { id: { in: ids } } });
      if (count !== ids.length) throw new BadRequestException("Um ou mais cursos são inválidos");
    }
    await this.prisma.$transaction(async tx => {
      await tx.learningPathCourse.deleteMany({ where: { learningPathId: pathId } });
      for (const item of items.sort((a,b) => a.position - b.position)) {
        await tx.learningPathCourse.create({ data: { learningPathId: pathId, courseId: item.courseId, position: item.position } });
      }
    });
    return this.listPaths();
  }

  async deletePath(id: string) {
    const path = await this.prisma.learningPath.findUnique({ where: { id }, select: { id: true, heroImageUrl: true } });
    if (!path) throw new NotFoundException("Trilha não encontrada");
    await this.prisma.learningPath.delete({ where: { id } });
    await this.images?.removeManaged(path.heroImageUrl);
    return { ok: true };
  }


  async listStudents(search = "", status = "", rawPage = 1) {
    const q = search.trim();
    const page = Math.max(1, Math.floor(Number(rawPage) || 1));
    const pageSize = 50;
    const now = new Date();
    const inactiveSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const activeEnrollment = {
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    const filter = status === "ACTIVE" || status === "BLOCKED"
      ? { status }
      : status === "NO_COURSE"
        ? { enrollments: { none: activeEnrollment } }
        : status === "INACTIVE"
          ? {
              status: "ACTIVE",
              AND: [
                { OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: inactiveSince } }] },
                { lessonProgress: { none: { updatedAt: { gte: inactiveSince } } } },
              ],
            }
          : {};
    const where: any = {
      role: "STUDENT",
      ...filter,
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ] } : {}),
    };
    const [total, students] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          enrollments: { select: { courseId: true, status: true, startsAt: true, expiresAt: true } },
          devices: { where: { revokedAt: null }, select: { id: true } },
          certificates: { select: { id: true } },
        },
      }),
    ]);
    const ids = students.map(student => student.id);
    const activeCourseIds = [...new Set(students.flatMap(student => student.enrollments
      .filter(item => item.status === "ACTIVE" && item.startsAt <= now && (!item.expiresAt || item.expiresAt > now))
      .map(item => item.courseId)))];
    const [activity, lessons] = await Promise.all([
      ids.length ? this.prisma.lessonProgress.groupBy({
        by: ["userId"], where: { userId: { in: ids } }, _max: { updatedAt: true },
      }) : Promise.resolve([]),
      activeCourseIds.length ? this.prisma.lesson.findMany({
        where: { published: true, module: { courseId: { in: activeCourseIds } } },
        select: { id: true, module: { select: { courseId: true } } },
      }) : Promise.resolve([]),
    ]);
    const lessonCourse = new Map(lessons.map(lesson => [lesson.id, lesson.module.courseId]));
    const completedProgress = ids.length && lessons.length ? await this.prisma.lessonProgress.findMany({
      where: { userId: { in: ids }, completed: true, lessonId: { in: lessons.map(lesson => lesson.id) } },
      select: { userId: true, lessonId: true },
    }) : [];
    const activityMap = new Map(activity.map(item => [item.userId, item._max.updatedAt]));
    const items = students.map(student => {
      const currentEnrollments = student.enrollments.filter(item => item.status === "ACTIVE" && item.startsAt <= now && (!item.expiresAt || item.expiresAt > now));
      const courseIds = new Set(currentEnrollments.map(item => item.courseId));
      const lessonIds = lessons.filter(lesson => courseIds.has(lesson.module.courseId)).map(lesson => lesson.id);
      const completed = completedProgress.filter(item => item.userId === student.id && courseIds.has(lessonCourse.get(item.lessonId) ?? "")).length;
      return {
        id: student.id, name: student.name, email: student.email, status: student.status,
        blockedReason: student.blockedReason, lastLoginAt: student.lastLoginAt, createdAt: student.createdAt,
        activeCourses: currentEnrollments.length, devices: student.devices.length, certificates: student.certificates.length,
        progressPercent: lessonIds.length ? Math.round((completed / lessonIds.length) * 100) : 0,
        lastActivityAt: activityMap.get(student.id) ?? null,
      };
    });
    return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async createStudent(data: CreateStudentDto) {
    const email = data.email.toLowerCase().trim();
    const cpf = data.cpf ? normalizeCpf(data.cpf) || null : null;
    const phone = data.phone?.replace(/\D/g, "") || null;
    if (cpf && !isValidCpf(cpf)) throw new BadRequestException("CPF inválido");
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new ConflictException("Já existe um usuário com este e-mail");
    if (cpf && await this.prisma.user.findUnique({ where: { cpf }, select: { id: true } })) throw new ConflictException("Já existe um usuário com este CPF");
    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (data.courseId) await this.ensureCourse(data.courseId);
    if (data.courseId && expiresAt && expiresAt <= startsAt) throw new BadRequestException("A expiração precisa ser posterior à data de início");
    const created = await this.prisma.user.create({
      data: {
        name: data.name.trim(), email, cpf, phone,
        passwordHash: data.password ? await hash(data.password, 12) : null,
        role: "STUDENT",
        ...(data.courseId ? { enrollments: { create: { courseId: data.courseId, status: "ACTIVE", startsAt, expiresAt, source: "admin-manual" } } } : {}),
      },
      select: {
        id: true, name: true, email: true, cpf: true, phone: true, status: true, createdAt: true,
        enrollments: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, startsAt: true, expiresAt: true, course: { select: { id: true, title: true, slug: true, status: true } } },
        },
      },
    });
    const { enrollments = [], ...user } = created;
    const enrollment = enrollments[0] ?? null;
    if (data.password) return { user, invite: null, enrollment };
    const invite = data.sendInviteEmail ? await this.auth.sendInvite(user.id) : await this.auth.createInvite(user.id);
    const delivered = "delivered" in invite ? Boolean(invite.delivered) : false;
    const deliveryStatus = data.sendInviteEmail ? (delivered ? "SENT" as const : "FAILED" as const) : "NOT_REQUESTED" as const;
    return { user, invite: { url: invite.url, delivered, deliveryStatus }, enrollment };
  }

  async importStudents(data: ImportStudentsDto) {
    const results: Array<{
      row: number;
      name: string;
      email: string;
      status: "CREATED" | "SKIPPED" | "FAILED";
      inviteUrl?: string;
      inviteDelivered?: boolean;
      inviteDeliveryStatus?: "SENT" | "FAILED" | "NOT_REQUESTED";
      message?: string;
    }> = [];
    const emails = new Set<string>();
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (let index = 0; index < data.rows.length; index++) {
      const source = data.rows[index];
      const email = source.email.toLowerCase().trim();
      const name = source.name.trim();
      const row = index + 2;

      if (emails.has(email)) {
        skipped++;
        results.push({ row, name, email, status: "SKIPPED", message: "E-mail repetido no arquivo" });
        continue;
      }
      emails.add(email);

      try {
        const result = await this.createStudent({
          name,
          email,
          ...(source.password ? { password: source.password } : {}),
          ...(!source.password ? { sendInviteEmail: Boolean(data.sendInviteEmail) } : {}),
        });
        created++;
        results.push({
          row,
          name: result.user.name,
          email: result.user.email,
          status: "CREATED",
          ...(result.invite
            ? {
              inviteUrl: result.invite.url,
              inviteDelivered: Boolean(result.invite.delivered),
              inviteDeliveryStatus: result.invite.deliveryStatus,
              ...(result.invite.deliveryStatus === "FAILED" ? { message: "Aluno criado, mas o convite não foi enviado por e-mail" } : {}),
            }
            : {}),
        });
      } catch (error) {
        const conflict = error instanceof ConflictException;
        if (conflict) skipped++;
        else failed++;
        results.push({
          row,
          name,
          email,
          status: conflict ? "SKIPPED" : "FAILED",
          message: error instanceof Error ? error.message : "Não foi possível importar o aluno",
        });
      }
    }

    return {
      total: data.rows.length,
      created,
      skipped,
      failed,
      results,
      message: `${created} aluno(s) criado(s), ${skipped} ignorado(s) e ${failed} com falha.`,
    };
  }

  async generateStudentInvite(userId: string, sendEmail = false) {
    await this.ensureStudent(userId);
    const invite = sendEmail ? await this.auth.sendInvite(userId) : await this.auth.createInvite(userId);
    const delivered = "delivered" in invite ? Boolean(invite.delivered) : false;
    const deliveryStatus = sendEmail ? (delivered ? "SENT" as const : "FAILED" as const) : "NOT_REQUESTED" as const;
    return { url: invite.url, delivered, deliveryStatus };
  }

  async getStudent(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        enrollments: { orderBy: { createdAt: "desc" }, include: { course: { select: { id: true, title: true, slug: true, status: true } } } },
        certificates: { orderBy: { issuedAt: "desc" }, include: { course: { select: { id: true, title: true, slug: true } } } },
        devices: { orderBy: { lastSeenAt: "desc" }, include: { watchSessions: { where: { status: "ACTIVE" }, select: { id: true, lessonId: true, lastSeenAt: true } } } },
        watchSessions: { orderBy: { startedAt: "desc" }, take: 20, include: { lesson: { select: { title: true, module: { select: { course: { select: { id: true, title: true } } } } } } } },
        lessonProgress: { orderBy: { updatedAt: "desc" }, take: 30, include: { lesson: { select: { id: true, title: true, durationSec: true, module: { select: { course: { select: { id: true, title: true, slug: true } } } } } } } },
        notifications: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!user || user.role !== "STUDENT") throw new NotFoundException("Aluno não encontrado");

    const enrollmentProgress = await Promise.all(user.enrollments.map(async enrollment => {
      const lessons = await this.prisma.lesson.findMany({ where: { published: true, module: { courseId: enrollment.courseId } }, select: { id: true } });
      const ids = lessons.map(item => item.id);
      const completed = ids.length ? await this.prisma.lessonProgress.count({ where: { userId: id, completed: true, lessonId: { in: ids } } }) : 0;
      return { ...enrollment, progressPercent: ids.length ? Math.round((completed / ids.length) * 100) : 0, completedLessons: completed, totalLessons: ids.length };
    }));
    const availableCourses = await this.prisma.course.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { title: "asc" }, select: { id: true, title: true, status: true } });
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return { ...safeUser, enrollments: enrollmentProgress, availableCourses };
  }

  async updateStudentStatus(id: string, data: StudentStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!user || user.role !== "STUDENT") throw new NotFoundException("Aluno não encontrado");
    const blocked = data.status === "BLOCKED";
    const result = await this.prisma.user.update({
      where: { id }, data: { status: data.status, blockedAt: blocked ? new Date() : null, blockedReason: blocked ? (data.reason?.trim() || "Bloqueado pelo administrador") : null, ...(blocked ? { sessionVersion: { increment: 1 } } : {}) },
      select: { id: true, name: true, email: true, status: true, blockedAt: true, blockedReason: true },
    });
    if (blocked) await this.prisma.watchSession.updateMany({ where: { userId: id, status: "ACTIVE" }, data: { status: "BLOCKED", blockReason: "Conta bloqueada", endedAt: new Date() } });
    await this.sessionCache?.invalidate(id);
    return result;
  }

  async grantEnrollment(userId: string, data: GrantEnrollmentDto) {
    await this.ensureStudent(userId);
    await this.ensureCourse(data.courseId);
    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (expiresAt && expiresAt <= startsAt) throw new BadRequestException("A expiração precisa ser posterior à data de início");
    return this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId: data.courseId } },
      update: { status: "ACTIVE", startsAt, expiresAt, source: "admin-manual" },
      create: { userId, courseId: data.courseId, status: "ACTIVE", startsAt, expiresAt, source: "admin-manual" },
      include: { course: { select: { id: true, title: true, slug: true, status: true } } },
    });
  }

  async updateEnrollment(userId: string, enrollmentId: string, data: UpdateEnrollmentDto) {
    await this.ensureStudent(userId);
    const current = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!current || current.userId !== userId) throw new NotFoundException("Matrícula não encontrada");
    const startsAt = data.startsAt === undefined ? current.startsAt : data.startsAt ? new Date(data.startsAt) : new Date();
    const expiresAt = data.expiresAt === undefined ? current.expiresAt : data.expiresAt ? new Date(data.expiresAt) : null;
    if (expiresAt && expiresAt <= startsAt) throw new BadRequestException("A expiração precisa ser posterior à data de início");
    const updated = await this.prisma.enrollment.update({ where: { id: enrollmentId }, data: { ...(data.status ? { status: data.status } : {}), startsAt, expiresAt } });
    if (updated.status !== "ACTIVE" || startsAt > new Date() || (expiresAt && expiresAt <= new Date())) await this.endCourseSessions(userId, updated.courseId, "Acesso ao curso alterado");
    return updated;
  }

  async cancelEnrollment(userId: string, enrollmentId: string) {
    await this.ensureStudent(userId);
    const current = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!current || current.userId !== userId) throw new NotFoundException("Matrícula não encontrada");
    const updated = await this.prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: "CANCELLED" } });
    await this.endCourseSessions(userId, current.courseId, "Acesso ao curso removido");
    return updated;
  }

  async sendNotification(userId: string, data: SendNotificationDto) {
    await this.ensureStudent(userId);
    const linkUrl = data.linkUrl?.trim() || null;
    if (linkUrl) {
      const safeInternal = linkUrl.startsWith("/") && !linkUrl.startsWith("//") && !linkUrl.includes("\\");
      const safeHttps = /^https:\/\//i.test(linkUrl);
      if (!safeInternal && !safeHttps) throw new BadRequestException("O link da notificação deve ser interno ou HTTPS");
    }
    return this.prisma.notification.create({ data: { userId, title: data.title.trim(), message: data.message.trim(), linkUrl } });
  }

  async revokeStudentDevice(userId: string, deviceId: string) {
    await this.ensureStudent(userId);
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.userId !== userId) throw new NotFoundException("Dispositivo não encontrado");
    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id: deviceId }, data: { revokedAt: new Date() } }),
      this.prisma.watchSession.updateMany({ where: { userId, deviceId, status: "ACTIVE" }, data: { status: "BLOCKED", blockReason: "Dispositivo revogado pelo administrador", endedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  async endStudentSession(userId: string, sessionId: string) {
    await this.ensureStudent(userId);
    const session = await this.prisma.watchSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new NotFoundException("Sessão não encontrada");
    return this.prisma.watchSession.update({ where: { id: sessionId }, data: { status: "BLOCKED", blockReason: "Sessão encerrada pelo administrador", endedAt: new Date() } });
  }

  private async ensureStudent(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!user || user.role !== "STUDENT") throw new NotFoundException("Aluno não encontrado");
    return user;
  }

  private requireImageStorage() {
    if (!this.images) throw new Error("Serviço de imagens não configurado");
    return this.images;
  }

  private async endCourseSessions(userId: string, courseId: string, reason: string) {
    const lessons = await this.prisma.lesson.findMany({ where: { module: { courseId } }, select: { id: true } });
    if (!lessons.length) return;
    await this.prisma.watchSession.updateMany({
      where: { userId, status: "ACTIVE", lessonId: { in: lessons.map(item => item.id) } },
      data: { status: "BLOCKED", blockReason: reason, endedAt: new Date() },
    });
  }

  private async endAllCourseSessions(courseId: string, reason: string) {
    const lessons = await this.prisma.lesson.findMany({ where: { module: { courseId } }, select: { id: true } });
    if (!lessons.length) return;
    await this.prisma.watchSession.updateMany({
      where: { status: "ACTIVE", lessonId: { in: lessons.map(item => item.id) } },
      data: { status: "BLOCKED", blockReason: reason, endedAt: new Date() },
    });
  }

  private async ensureCourse(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id }, select: { id: true } });
    if (!course) throw new NotFoundException("Curso não encontrado");
    return course;
  }
  private async ensureModule(id: string) {
    const module = await this.prisma.courseModule.findUnique({ where: { id }, select: { id: true, courseId: true } });
    if (!module) throw new NotFoundException("Módulo não encontrado");
    return module;
  }
  private async ensureLesson(id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id }, select: { id: true, moduleId: true, published: true, videoResourceId: true } });
    if (!lesson) throw new NotFoundException("Aula não encontrada");
    return lesson;
  }
  private async markVideoAssetsDetached(where: Record<string, unknown>) {
    if (!this.videoLifecycle) return;
    const lessons = await this.prisma.lesson.findMany({ where, select: { videoResourceId: true } });
    await this.videoLifecycle.markDetached(lessons.map(item => item.videoResourceId));
  }
  private async compactModulePositions(courseId: string) {
    const modules = await this.prisma.courseModule.findMany({ where: { courseId }, orderBy: { position: "asc" }, select: { id: true } });
    await this.prisma.$transaction(modules.map((m, i) => this.prisma.courseModule.update({ where: { id: m.id }, data: { position: i + 1 } })));
  }
  private async compactLessonPositions(moduleId: string) {
    const lessons = await this.prisma.lesson.findMany({ where: { moduleId }, orderBy: { position: "asc" }, select: { id: true } });
    await this.prisma.$transaction(lessons.map((l, i) => this.prisma.lesson.update({ where: { id: l.id }, data: { position: i + 1 } })));
  }
}
