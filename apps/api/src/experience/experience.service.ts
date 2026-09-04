import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FEATURES } from "../common/features";
import { Prisma } from "../generated/prisma/client";

const courseCardSelect = {
  id: true,
  slug: true,
  title: true,
  shortDescription: true,
  description: true,
  cardImageUrl: true,
  heroImageUrl: true,
  featured: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  categories: { select: { id: true, name: true, slug: true } },
  modules: {
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      position: true,
      lessons: {
        where: { published: true },
        orderBy: { position: "asc" as const },
        select: { id: true, durationSec: true, position: true },
      },
    },
  },
} as const satisfies Prisma.CourseSelect;

type CourseWithRelations = Prisma.CourseGetPayload<{ select: typeof courseCardSelect }>;
const CERTIFICATE_CODE_PATTERN = /^CERT-\d{4}-(?:[A-F0-9]{10}|[A-F0-9]{16})$/;

@Injectable()
export class ExperienceService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadPublishedCourses(
    where: Prisma.CourseWhereInput = {},
    pagination: { skip?: number; take?: number } = {},
  ) {
    return this.prisma.course.findMany({
      where: { ...where, status: "PUBLISHED" },
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      select: courseCardSelect,
      ...pagination,
    });
  }

  private lessonIds(course: CourseWithRelations) {
    return course.modules.flatMap(module => module.lessons.map(lesson => lesson.id));
  }

  private async decorateCourses(userId: string, courses: CourseWithRelations[]) {
    if (!courses.length) return [];
    const courseIds = courses.map(course => course.id);
    const lessonIds = courses.flatMap(course => this.lessonIds(course));
    const now = new Date();
    const [favoriteIds, enrolledIds, progress] = await Promise.all([
      this.prisma.favorite.findMany({ where: { userId, courseId: { in: courseIds } }, select: { courseId: true } }).then(items => new Set(items.map(item => item.courseId))),
      this.prisma.enrollment.findMany({
        where: { userId, courseId: { in: courseIds }, status: "ACTIVE", startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { courseId: true },
      }).then(items => new Set(items.map(item => item.courseId))),
      lessonIds.length
        ? this.prisma.lessonProgress.findMany({ where: { userId, lessonId: { in: lessonIds } }, select: { lessonId: true, completed: true, positionSec: true, updatedAt: true } })
        : Promise.resolve([]),
    ]);
    const progressMap = new Map(progress.map(item => [item.lessonId, item]));

    return courses.map(course => {
      const lessons = course.modules.flatMap(module => module.lessons);
      const completed = lessons.filter(lesson => progressMap.get(lesson.id)?.completed).length;
      const progressUnits = lessons.reduce((sum, lesson) => {
        const item = progressMap.get(lesson.id);
        if (!item) return sum;
        if (item.completed) return sum + 1;
        if (lesson.durationSec && item.positionSec > 0) return sum + Math.min(item.positionSec / lesson.durationSec, 0.95);
        return sum;
      }, 0);
      const percent = lessons.length ? Math.round((progressUnits / lessons.length) * 100) : 0;
      const touched = lessons
        .map(lesson => ({ lesson, progress: progressMap.get(lesson.id) }))
        .filter(item => item.progress)
        .sort((a, b) => b.progress!.updatedAt.getTime() - a.progress!.updatedAt.getTime());
      const last = touched[0];
      const firstIncomplete = lessons.find(lesson => !progressMap.get(lesson.id)?.completed);
      const nextLesson = last?.progress && !last.progress.completed ? last.lesson : firstIncomplete ?? lessons[0];
      return {
        id: course.id,
        slug: course.slug,
        title: course.title,
        shortDescription: course.shortDescription,
        description: course.description,
        cardImageUrl: course.cardImageUrl,
        heroImageUrl: course.heroImageUrl,
        featured: course.featured,
        categories: course.categories,
        favorite: favoriteIds.has(course.id),
        enrolled: enrolledIds.has(course.id),
        progressPercent: percent,
        completedLessons: completed,
        totalLessons: lessons.length,
        nextLessonId: nextLesson?.id ?? null,
        lastActivityAt: last?.progress?.updatedAt ?? null,
        durationSec: lessons.reduce((sum, lesson) => sum + (lesson.durationSec ?? 0), 0),
      };
    });
  }

  async home(userId: string) {
    const now = new Date();
    const activeEnrollment = { status: "ACTIVE" as const, startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const [topCourses, enrollmentRows, favoriteRows, recentProgress] = await Promise.all([
      this.prisma.course.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ featured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
        take: 12,
      }),
      this.prisma.enrollment.findMany({
        where: { userId, ...activeEnrollment, course: { status: "PUBLISHED" } },
        orderBy: { updatedAt: "desc" },
        select: { courseId: true },
        take: 20,
      }),
      this.prisma.favorite.findMany({
        where: { userId, course: { status: "PUBLISHED" } },
        orderBy: { createdAt: "desc" },
        select: { courseId: true },
        take: 20,
      }),
      this.prisma.lessonProgress.findMany({
        where: { userId, lesson: { published: true, module: { course: { status: "PUBLISHED" } } } },
        orderBy: { updatedAt: "desc" },
        select: { lesson: { select: { module: { select: { courseId: true } } } } },
        take: 50,
      }),
    ]);
    const enrolledIds = new Set(enrollmentRows.map(item => item.courseId));
    const favoriteIds = new Set(favoriteRows.map(item => item.courseId));
    const courseIds = [...new Set([
      ...topCourses.map(item => item.id),
      ...enrolledIds,
      ...favoriteIds,
      ...recentProgress.map(item => item.lesson.module.courseId),
    ])];
    const courses = await this.loadPublishedCourses({ id: { in: courseIds } });
    const decorated = await this.decorateCourses(userId, courses);
    const byId = new Map(decorated.map(course => [course.id, course]));
    const featured = decorated.find(course => course.featured) ?? decorated[0] ?? null;
    const continueWatching = decorated
      .filter(course => course.enrolled && course.lastActivityAt && course.progressPercent < 100)
      .sort((a, b) => new Date(b.lastActivityAt!).getTime() - new Date(a.lastActivityAt!).getTime())
      .slice(0, 10);
    const myList = favoriteRows.flatMap(item => {
      const course = byId.get(item.courseId);
      return course ? [course] : [];
    }).slice(0, 10);
    const library = enrollmentRows.flatMap(item => {
      const course = byId.get(item.courseId);
      return course ? [course] : [];
    }).slice(0, 10);

    let categoryRows: Array<{ id: string; name: string; slug: string; courses: typeof decorated }> = [];
    let paths: Awaited<ReturnType<ExperienceService["pathCards"]>> = [];
    if (FEATURES.categoriesAndPaths) {
      const [categories, pathCards] = await Promise.all([
        this.prisma.category.findMany({ orderBy: { name: "asc" } }),
        this.pathCards(userId),
      ]);
      categoryRows = categories
        .map(category => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          courses: decorated.filter(course => course.categories.some(item => item.id === category.id)).slice(0, 10),
        }))
        .filter(row => row.courses.length > 0);
      paths = pathCards;
    }
    return { featured, continueWatching, myList, library, categoryRows, paths };
  }

  async library(userId: string, rawPage: number | string = 1, rawLimit: number | string = 24, rawFavoritePage: number | string = 1) {
    const { page, limit } = this.pagination(rawPage, rawLimit);
    const { page: favoritePage } = this.pagination(rawFavoritePage, rawLimit);
    const now = new Date();
    const enrollmentWhere: Prisma.EnrollmentWhereInput = {
      userId,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      course: { status: "PUBLISHED" },
    };
    const favoriteWhere: Prisma.FavoriteWhereInput = { userId, course: { status: "PUBLISHED" } };
    const [total, enrollmentRows, favoriteTotal, favoriteRows] = await Promise.all([
      this.prisma.enrollment.count({ where: enrollmentWhere }),
      this.prisma.enrollment.findMany({
        where: enrollmentWhere,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: { courseId: true },
      }),
      this.prisma.favorite.count({ where: favoriteWhere }),
      this.prisma.favorite.findMany({
        where: favoriteWhere,
        orderBy: { createdAt: "desc" },
        skip: (favoritePage - 1) * limit,
        take: limit,
        select: { courseId: true },
      }),
    ]);
    const enrolledIds = new Set(enrollmentRows.map(item => item.courseId));
    const favoriteIds = new Set(favoriteRows.map(item => item.courseId));
    const ids = [...new Set([...enrolledIds, ...favoriteIds])];
    const courses = await this.loadPublishedCourses({ id: { in: ids } });
    const decorated = await this.decorateCourses(userId, courses);
    const byId = new Map(decorated.map(course => [course.id, course]));
    return {
      courses: decorated.filter(course => course.enrolled).sort((a, b) => b.progressPercent - a.progressPercent),
      favorites: favoriteRows.flatMap(item => {
        const course = byId.get(item.courseId);
        return course ? [course] : [];
      }),
      total,
      favoriteTotal,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      favoritePage,
      favoritePages: Math.max(1, Math.ceil(favoriteTotal / limit)),
    };
  }

  async catalog(userId: string, rawQuery?: string, category?: string, rawPage: number | string = 1, rawLimit: number | string = 24) {
    const query = rawQuery?.trim().slice(0, 200) ?? "";
    const safeCategory = FEATURES.categoriesAndPaths ? category?.slice(0, 100) : undefined;
    const { page, limit } = this.pagination(rawPage, rawLimit);
    const where: Prisma.CourseWhereInput = {
      ...(safeCategory ? { categories: { some: { slug: safeCategory } } } : {}),
      ...(query ? {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { shortDescription: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { categories: { some: { name: { contains: query, mode: "insensitive" } } } },
        ],
      } : {}),
    };
    const [total, courses, categories] = await Promise.all([
      this.prisma.course.count({ where: { ...where, status: "PUBLISHED" } }),
      this.loadPublishedCourses(where, { skip: (page - 1) * limit, take: limit }),
      FEATURES.categoriesAndPaths
        ? this.prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } })
        : Promise.resolve([]),
    ]);
    const decorated = await this.decorateCourses(userId, courses);
    const pages = Math.max(1, Math.ceil(total / limit));
    return {
      query: (rawQuery ?? "").slice(0, 200),
      category: safeCategory ?? "",
      categories,
      courses: decorated,
      total,
      page,
      limit,
      pages,
      hasMore: page < pages,
    };
  }

  private pagination(rawPage: number | string, rawLimit: number | string) {
    const parsedPage = Math.floor(Number(rawPage));
    const parsedLimit = Math.floor(Number(rawLimit));
    return {
      page: Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1,
      limit: Number.isFinite(parsedLimit) ? Math.min(48, Math.max(1, parsedLimit)) : 24,
    };
  }

  private async pathCards(userId: string) {
    const paths = await this.prisma.learningPath.findMany({
      where: { published: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { courses: { orderBy: { position: "asc" }, include: { course: { select: { id: true, status: true } } } } },
    });
    const courseIds = paths.flatMap(path => path.courses.map(item => item.course.id));
    const enrollments = await this.prisma.enrollment.findMany({ where: { userId, courseId: { in: courseIds }, status: "ACTIVE", startsAt: { lte: new Date() }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { courseId: true } });
    const enrolledIds = new Set(enrollments.map(item => item.courseId));
    return paths.map(path => ({
      id: path.id,
      slug: path.slug,
      title: path.title,
      description: path.description,
      heroImageUrl: path.heroImageUrl,
      totalCourses: path.courses.filter(item => item.course.status === "PUBLISHED").length,
      enrolledCourses: path.courses.filter(item => item.course.status === "PUBLISHED" && enrolledIds.has(item.course.id)).length,
    }));
  }

  async paths(userId: string) {
    return { paths: await this.pathCards(userId) };
  }

  async pathBySlug(userId: string, slug: string) {
    const path = await this.prisma.learningPath.findFirst({
      where: { slug, published: true },
      include: {
        courses: {
          orderBy: { position: "asc" },
          include: {
            course: {
              include: {
                categories: { select: { id: true, name: true, slug: true } },
                modules: { orderBy: { position: "asc" }, include: { lessons: { where: { published: true }, orderBy: { position: "asc" }, select: { id: true, title: true, durationSec: true, position: true } } } },
              },
            },
          },
        },
      },
    });
    if (!path) throw new NotFoundException("Trilha não encontrada");
    const published = path.courses.map(item => item.course).filter(course => course.status === "PUBLISHED") as CourseWithRelations[];
    const courses = await this.decorateCourses(userId, published);
    return { id: path.id, slug: path.slug, title: path.title, description: path.description, heroImageUrl: path.heroImageUrl, courses };
  }

  async course(userId: string, slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: "PUBLISHED" },
      include: {
        categories: { select: { id: true, name: true, slug: true } },
        modules: { orderBy: { position: "asc" }, include: { lessons: { where: { published: true }, orderBy: { position: "asc" } } } },
      },
    });
    if (!course) throw new NotFoundException("Curso não encontrado");
    const [decorated] = await this.decorateCourses(userId, [course as CourseWithRelations]);
    const progress = await this.prisma.lessonProgress.findMany({ where: { userId, lessonId: { in: this.lessonIds(course as CourseWithRelations) } } });
    const progressMap = new Map(progress.map(item => [item.lessonId, item]));
    const certificate = await this.prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
      select: { code: true, issuedAt: true },
    });
    return {
      ...decorated,
      certificateEnabled: course.certificateEnabled,
      certificate,
      modules: course.modules.map(module => ({
        id: module.id,
        title: module.title,
        position: module.position,
        lessons: module.lessons.map(lesson => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          durationSec: lesson.durationSec,
          preview: lesson.preview,
          videoStatus: lesson.videoStatus,
          completed: progressMap.get(lesson.id)?.completed ?? false,
          positionSec: progressMap.get(lesson.id)?.positionSec ?? 0,
        })),
      })),
    };
  }

  private async assertLessonAccess(userId: string, role: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson || !lesson.published || lesson.module.course.status !== "PUBLISHED") throw new NotFoundException("Aula não encontrada");
    if (role === "ADMIN" || role === "INSTRUCTOR" || lesson.preview) return lesson;
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: lesson.module.courseId } },
    });
    const now = new Date();
    const active = enrollment?.status === "ACTIVE" && enrollment.startsAt <= now && (!enrollment.expiresAt || enrollment.expiresAt > now);
    if (!active) throw new ForbiddenException("Você não possui acesso a esta aula");
    return lesson;
  }

  async lessonResources(userId: string, role: string, lessonId: string) {
    const lesson = await this.assertLessonAccess(userId, role, lessonId);
    const [chapters, materials, transcript, progress] = await Promise.all([
      this.prisma.lessonChapter.findMany({ where: { lessonId }, orderBy: { position: "asc" } }),
      this.prisma.lessonMaterial.findMany({ where: { lessonId }, orderBy: { position: "asc" } }),
      this.prisma.lessonTranscript.findUnique({ where: { lessonId } }),
      this.prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } }),
    ]);
    return {
      lesson: { id: lesson.id, title: lesson.title, description: lesson.description },
      chapters,
      materials,
      transcript: transcript ? { content: transcript.content, language: transcript.language, updatedAt: transcript.updatedAt } : null,
      progress: progress ? { positionSec: progress.positionSec, completed: progress.completed, completedAt: progress.completedAt } : null,
    };
  }

  async history(userId: string) {
    const items = await this.prisma.lessonProgress.findMany({
      where: { userId, lesson: { published: true, module: { course: { status: "PUBLISHED" } } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { lesson: { include: { module: { include: { course: { select: { id: true, title: true, slug: true, cardImageUrl: true } } } } } } },
    });
    return {
      items: items.map(item => ({
        lessonId: item.lessonId,
        lessonTitle: item.lesson.title,
        course: item.lesson.module.course,
        positionSec: item.positionSec,
        completed: item.completed,
        completedAt: item.completedAt,
        lastActivityAt: item.updatedAt,
        durationSec: item.lesson.durationSec,
      })),
    };
  }

  async certificates(userId: string) {
    const certificates = await this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: "desc" },
      include: { course: { select: { id: true, title: true, slug: true, certificateTitle: true, cardImageUrl: true } } },
    });
    return { certificates };
  }

  async certificate(userId: string, code: string) {
    const certificate = await this.prisma.certificate.findFirst({
      where: { code, userId },
      include: { user: { select: { name: true } }, course: { select: { title: true, certificateTitle: true, slug: true } } },
    });
    if (!certificate) throw new NotFoundException("Certificado não encontrado");
    return certificate;
  }

  async verifyCertificate(rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!CERTIFICATE_CODE_PATTERN.test(code)) {
      return { valid: false as const, certificate: null };
    }

    const certificate = await this.prisma.certificate.findUnique({
      where: { code },
      select: {
        code: true,
        issuedAt: true,
        user: { select: { name: true } },
        course: { select: { title: true, certificateTitle: true } },
      },
    });
    if (!certificate) return { valid: false as const, certificate: null };

    return {
      valid: true as const,
      certificate: {
        code: certificate.code,
        studentName: certificate.user.name,
        courseTitle: certificate.course.certificateTitle || certificate.course.title,
        issuedAt: certificate.issuedAt,
      },
    };
  }

  async notifications(userId: string) {
    const [unread, notifications] = await Promise.all([
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    return { unread, notifications };
  }

  async notificationSummary(userId: string) {
    const [unread, notifications] = await Promise.all([
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);
    return { unread, notifications };
  }

  async markNotificationRead(userId: string, id: string) {
    const item = await this.prisma.notification.findUnique({ where: { id } });
    if (!item || item.userId !== userId) throw new NotFoundException("Notificação não encontrada");
    return this.prisma.notification.update({ where: { id }, data: { readAt: item.readAt ?? new Date() } });
  }

  async markAllNotificationsRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async favorite(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { status: true } });
    if (!course || course.status !== "PUBLISHED") throw new NotFoundException("Curso não encontrado");
    return this.prisma.favorite.upsert({ where: { userId_courseId: { userId, courseId } }, update: {}, create: { userId, courseId } });
  }

  async unfavorite(userId: string, courseId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, courseId } });
    return { ok: true };
  }
}
