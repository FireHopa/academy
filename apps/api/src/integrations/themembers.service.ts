import { BadRequestException, Inject, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { AcademyJob, JOB_DISPATCHER, type JobDispatcher } from "../jobs/jobs.types";

type ExternalProductPayload = {
  id?: string | number;
  product_id?: string | number;
  title?: string;
  name?: string;
  description?: string | null;
  status?: string | number | null;
  [key: string]: unknown;
};

type ExternalLessonPayload = {
  id?: string | number;
  title?: string;
  subtitle?: string | null;
  slug?: string;
  blocked?: string | number | boolean;
  published?: string | number | boolean;
};

type ExternalModulePayload = {
  id?: string | number;
  title?: string;
  description?: string | null;
  slug?: string;
  blocked?: string | number | boolean;
  published?: string | number | boolean;
  lessons?: ExternalLessonPayload[];
};

type ExternalCoursePayload = {
  id?: string | number;
  title?: string;
  description?: string | null;
  status?: string | number | null;
  slug?: string;
  blocked?: string | number | boolean;
  published?: string | number | boolean;
  modules?: ExternalModulePayload[];
};

type WebhookSource = "CHECKOUT" | "PLATFORM";
const THEMEMBERS_API_TIMEOUT_MS = 15_000;

@Injectable()
export class TheMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    @Optional() @Inject(JOB_DISPATCHER) private readonly jobs?: JobDispatcher,
  ) {}

  status() {
    const mode = String(this.config.get("THEMEMBERS_API_MODE") ?? "legacy").toLowerCase();
    const v1TokenConfigured = Boolean(this.config.get("THEMEMBERS_API_TOKEN"));
    const apiConfigured = mode === "legacy"
      ? Boolean(this.config.get("THEMEMBERS_DEVELOPER_TOKEN") && this.config.get("THEMEMBERS_PLATFORM_TOKEN"))
      : Boolean(v1TokenConfigured && this.config.get("THEMEMBERS_PRODUCTS_ENDPOINT"));
    const accessEnabled = String(this.config.get("THEMEMBERS_ACCESS_AUTOMATION") ?? "false").toLowerCase() === "true";
    return {
      enabled: String(this.config.get("THEMEMBERS_ENABLED") ?? "false").toLowerCase() === "true",
      mode,
      apiConfigured,
      coursesApiConfigured: v1TokenConfigured,
      checkoutWebhookConfigured: Boolean(this.config.get("THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN")),
      platformWebhookConfigured: Boolean(this.config.get("THEMEMBERS_PLATFORM_WEBHOOK_CLIENT_TOKEN")),
      accessAutomation: {
        enabled: accessEnabled,
        grantEvents: ["release.access", ...this.eventList("THEMEMBERS_GRANT_EVENTS")],
        revokeEvents: ["revoke.access", ...this.eventList("THEMEMBERS_REVOKE_EVENTS")],
      },
    };
  }

  async testConnection() {
    const status = this.status();
    if (!status.apiConfigured && !status.coursesApiConfigured) throw new ServiceUnavailableException("Nenhuma credencial de API TheMembers está configurada");
    const [products, courses] = await Promise.all([
      status.apiConfigured ? this.fetchProducts() : Promise.resolve([]),
      status.coursesApiConfigured ? this.fetchCourses() : Promise.resolve([]),
    ]);
    return { ok: true, provider: "THEMEMBERS", productsFound: products.length, coursesFound: courses.length };
  }

  async listRemoteCourses() {
    const payload = await this.fetchCourses();
    const courses = payload.map(course => this.normalizeCourse(course)).filter((course): course is NonNullable<typeof course> => Boolean(course));
    const imported = courses.length ? await this.prisma.course.findMany({
      where: { sourceProvider: "THEMEMBERS", sourceExternalId: { in: courses.map(course => course.id) } },
      select: { id: true, title: true, slug: true, status: true, sourceExternalId: true, sourceSyncedAt: true },
    }) : [];
    const importedByExternalId = new Map(imported.map(course => [course.sourceExternalId, course]));
    return {
      courses: courses.map(course => ({ ...course, localCourse: importedByExternalId.get(course.id) ?? null })),
      totals: {
        courses: courses.length,
        modules: courses.reduce((total, course) => total + course.modules.length, 0),
        lessons: courses.reduce((total, course) => total + course.modules.reduce((moduleTotal, module) => moduleTotal + module.lessons.length, 0), 0),
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  async importRemoteCourse(externalId: string) {
    const normalizedExternalId = externalId.trim();
    if (!normalizedExternalId) throw new BadRequestException("ID do curso TheMembers é obrigatório");
    const payload = await this.fetchCourses();
    const remoteCourse = payload
      .map(course => this.normalizeCourse(course))
      .find((course): course is NonNullable<typeof course> => Boolean(course && course.id === normalizedExternalId));
    if (!remoteCourse) throw new BadRequestException("Curso não encontrado na TheMembers");

    const syncedAt = new Date();
    const result = await this.prisma.$transaction(async tx => {
      // Serializa as importações para garantir slug e posições únicos mesmo com cliques simultâneos.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('THEMEMBERS:COURSE_IMPORT'))`;
      let localCourse = await tx.course.findUnique({
        where: { sourceProvider_sourceExternalId: { sourceProvider: "THEMEMBERS", sourceExternalId: remoteCourse.id } },
      });
      const courseCreated = !localCourse;
      if (!localCourse) {
        localCourse = await tx.course.create({
          data: {
            title: remoteCourse.title,
            slug: await this.uniqueCourseSlug(tx, remoteCourse.slug || remoteCourse.title, remoteCourse.id),
            description: remoteCourse.description,
            shortDescription: this.shortDescription(remoteCourse.description),
            status: "DRAFT",
            sourceProvider: "THEMEMBERS",
            sourceExternalId: remoteCourse.id,
            sourceSyncedAt: syncedAt,
          },
        });
      } else {
        localCourse = await tx.course.update({
          where: { id: localCourse.id },
          data: { title: remoteCourse.title, description: remoteCourse.description, sourceSyncedAt: syncedAt },
        });
      }

      let modulesCreated = 0;
      let modulesUpdated = 0;
      let lessonsCreated = 0;
      let lessonsUpdated = 0;
      let preservedLessons = 0;
      let modulesRemovedFromSource = 0;
      let lessonsRemovedFromSource = 0;
      let lessonsUnpublished = 0;
      const sessionsToEndForLessonIds = new Set<string>();
      const importedModuleIds: string[] = [];
      const modulesBefore = await tx.courseModule.findMany({ where: { courseId: localCourse.id }, orderBy: { position: "asc" }, select: { id: true, position: true } });
      let nextModulePosition = Math.max(0, ...modulesBefore.map(module => module.position)) + 1;

      for (const remoteModule of remoteCourse.modules) {
        let localModule = await tx.courseModule.findUnique({
          where: { sourceProvider_sourceExternalId: { sourceProvider: "THEMEMBERS", sourceExternalId: remoteModule.id } },
        });
        if (localModule && localModule.courseId !== localCourse.id) throw new BadRequestException(`O módulo externo ${remoteModule.id} já pertence a outro curso local`);
        if (localModule) {
          localModule = await tx.courseModule.update({ where: { id: localModule.id }, data: { title: remoteModule.title, sourceSyncedAt: syncedAt } });
          modulesUpdated++;
        } else {
          localModule = await tx.courseModule.create({
            data: { courseId: localCourse.id, title: remoteModule.title, position: nextModulePosition++, sourceProvider: "THEMEMBERS", sourceExternalId: remoteModule.id, sourceSyncedAt: syncedAt },
          });
          modulesCreated++;
        }
        importedModuleIds.push(localModule.id);

        const lessonsBefore = await tx.lesson.findMany({ where: { moduleId: localModule.id }, orderBy: { position: "asc" }, select: { id: true, position: true } });
        let nextLessonPosition = Math.max(0, ...lessonsBefore.map(lesson => lesson.position)) + 1;
        const importedLessonIds: string[] = [];
        for (const remoteLesson of remoteModule.lessons) {
          const published = remoteCourse.published && !remoteCourse.blocked
            && remoteModule.published && !remoteModule.blocked
            && remoteLesson.published && !remoteLesson.blocked;
          let localLesson = await tx.lesson.findUnique({
            where: { sourceProvider_sourceExternalId: { sourceProvider: "THEMEMBERS", sourceExternalId: remoteLesson.id } },
          });
          const wasPublished = localLesson?.published === true;
          if (localLesson && localLesson.moduleId !== localModule.id) {
            localLesson = await tx.lesson.update({
              where: { id: localLesson.id },
              data: { moduleId: localModule.id, position: nextLessonPosition++, title: remoteLesson.title, description: remoteLesson.subtitle, published, sourceSyncedAt: syncedAt },
            });
            lessonsUpdated++;
          } else if (localLesson) {
            localLesson = await tx.lesson.update({ where: { id: localLesson.id }, data: { title: remoteLesson.title, description: remoteLesson.subtitle, published, sourceSyncedAt: syncedAt } });
            lessonsUpdated++;
          } else {
            localLesson = await tx.lesson.create({
              data: {
                moduleId: localModule.id,
                title: remoteLesson.title,
                description: remoteLesson.subtitle,
                position: nextLessonPosition++,
                published,
                sourceProvider: "THEMEMBERS",
                sourceExternalId: remoteLesson.id,
                sourceSyncedAt: syncedAt,
              },
            });
            lessonsCreated++;
          }
          if (wasPublished && !published) {
            lessonsUnpublished++;
            sessionsToEndForLessonIds.add(localLesson.id);
          }
          importedLessonIds.push(localLesson.id);
        }

        const lessonsAfter = await tx.lesson.findMany({
          where: { moduleId: localModule.id },
          orderBy: { position: "asc" },
          select: { id: true, position: true, published: true, sourceProvider: true },
        });
        const missingImportedLessons = lessonsAfter.filter(lesson => lesson.sourceProvider === "THEMEMBERS" && !importedLessonIds.includes(lesson.id));
        lessonsRemovedFromSource += missingImportedLessons.length;
        if (missingImportedLessons.length) {
          const publishedMissingLessonIds = missingImportedLessons.filter(lesson => lesson.published).map(lesson => lesson.id);
          publishedMissingLessonIds.forEach(id => sessionsToEndForLessonIds.add(id));
          if (publishedMissingLessonIds.length) {
            const unpublished = await tx.lesson.updateMany({
              where: { id: { in: publishedMissingLessonIds }, published: true },
              data: { published: false },
            });
            lessonsUnpublished += unpublished.count;
          }
        }
        preservedLessons += lessonsAfter.filter(lesson => lesson.sourceProvider !== "THEMEMBERS").length;
        await this.resequence(lessonsAfter, importedLessonIds, (id, position) => tx.lesson.update({ where: { id }, data: { position } }));
      }

      const modulesAfter = await tx.courseModule.findMany({
        where: { courseId: localCourse.id },
        orderBy: { position: "asc" },
        select: { id: true, position: true, sourceProvider: true },
      });
      const missingImportedModules = modulesAfter.filter(module => module.sourceProvider === "THEMEMBERS" && !importedModuleIds.includes(module.id));
      modulesRemovedFromSource = missingImportedModules.length;
      if (missingImportedModules.length) {
        const publishedMissingModuleLessons = await tx.lesson.findMany({
          where: {
            moduleId: { in: missingImportedModules.map(module => module.id) },
            sourceProvider: "THEMEMBERS",
            published: true,
          },
          select: { id: true },
        });
        publishedMissingModuleLessons.forEach(lesson => sessionsToEndForLessonIds.add(lesson.id));
        if (publishedMissingModuleLessons.length) {
          const unpublished = await tx.lesson.updateMany({
            where: {
              id: { in: publishedMissingModuleLessons.map(lesson => lesson.id) },
              published: true,
            },
            data: { published: false },
          });
          lessonsUnpublished += unpublished.count;
        }
      }
      const preservedModules = modulesAfter.filter(module => module.sourceProvider !== "THEMEMBERS").length;
      await this.resequence(modulesAfter, importedModuleIds, (id, position) => tx.courseModule.update({ where: { id }, data: { position } }));

      if (sessionsToEndForLessonIds.size) {
        await tx.watchSession.updateMany({
          where: { lessonId: { in: [...sessionsToEndForLessonIds] }, status: "ACTIVE" },
          data: { status: "BLOCKED", blockReason: "source_content_unavailable", endedAt: syncedAt },
        });
      }

      const summary = {
        courseCreated,
        modulesCreated,
        modulesUpdated,
        lessonsCreated,
        lessonsUpdated,
        preservedModules,
        preservedLessons,
        modulesRemovedFromSource,
        lessonsRemovedFromSource,
        lessonsUnpublished,
      };
      await tx.integrationLog.create({
        data: {
          provider: "THEMEMBERS",
          level: "INFO",
          action: "course.import",
          message: `${remoteCourse.title} importado da TheMembers`,
          metadata: { externalCourseId: remoteCourse.id, localCourseId: localCourse.id, ...summary },
        },
      });
      return { localCourse: { id: localCourse.id, title: localCourse.title, slug: localCourse.slug, status: localCourse.status }, ...summary };
    });

    const action = result.courseCreated ? "importado" : "atualizado";
    const visibilityMessage = result.lessonsUnpublished
      ? ` ${result.lessonsUnpublished} aula(s) foram despublicada(s) por bloqueio ou remoção na origem.`
      : "";
    return {
      ok: true,
      ...result,
      message: `${remoteCourse.title} ${action}: ${result.modulesCreated} módulo(s) e ${result.lessonsCreated} aula(s) criado(s).${visibilityMessage}`,
    };
  }

  async syncProducts() {
    const products = await this.fetchProducts();
    let synced = 0;
    for (const item of products) {
      const externalId = String(item.id ?? item.product_id ?? "").trim();
      if (!externalId) continue;
      const productCode = item.product_id != null ? String(item.product_id) : null;
      const title = String(item.title ?? item.name ?? `Produto ${externalId}`).trim();
      await this.prisma.externalProduct.upsert({
        where: { provider_externalId: { provider: "THEMEMBERS", externalId } },
        update: { productCode, title, description: typeof item.description === "string" ? item.description : null, status: item.status != null ? String(item.status) : null, raw: item as any, lastSyncedAt: new Date() },
        create: { provider: "THEMEMBERS", externalId, productCode, title, description: typeof item.description === "string" ? item.description : null, status: item.status != null ? String(item.status) : null, raw: item as any },
      });
      synced++;
    }
    await this.log("INFO", "products.sync", `${synced} produto(s) sincronizado(s) da TheMembers`, { fetched: products.length });
    return { ok: true, fetched: products.length, synced, message: `${synced} produto(s) sincronizado(s).` };
  }

  listProducts() {
    return this.prisma.externalProduct.findMany({
      where: { provider: "THEMEMBERS" },
      orderBy: [{ title: "asc" }],
      include: { courses: { include: { course: { select: { id: true, title: true, slug: true, status: true } } } } },
    });
  }

  async setProductCourses(productId: string, courseIds: string[]) {
    const product = await this.prisma.externalProduct.findUnique({ where: { id: productId } });
    if (!product || product.provider !== "THEMEMBERS") throw new BadRequestException("Produto TheMembers não encontrado");
    const uniqueCourseIds = [...new Set(courseIds)];
    if (uniqueCourseIds.length) {
      const count = await this.prisma.course.count({ where: { id: { in: uniqueCourseIds } } });
      if (count !== uniqueCourseIds.length) throw new BadRequestException("Um ou mais cursos são inválidos");
    }
    await this.prisma.$transaction(async tx => {
      await tx.productCourse.deleteMany({ where: { externalProductId: productId } });
      for (const courseId of uniqueCourseIds) await tx.productCourse.create({ data: { externalProductId: productId, courseId } });
    });
    await this.log("INFO", "product.mapping", `Mapeamento atualizado para ${product.title}`, { productId, courseIds: uniqueCourseIds });
    return this.prisma.externalProduct.findUnique({ where: { id: productId }, include: { courses: { include: { course: true } } } });
  }

  async setCheckoutReference(productId: string, checkoutReferenceId?: string) {
    const product = await this.prisma.externalProduct.findUnique({ where: { id: productId } });
    if (!product || product.provider !== "THEMEMBERS") throw new BadRequestException("Produto TheMembers não encontrado");
    const normalized = checkoutReferenceId?.trim() || null;
    const updated = await this.prisma.externalProduct.update({ where: { id: productId }, data: { checkoutReferenceId: normalized } });
    await this.log("INFO", "product.reference", `Reference ID do Checkout atualizado para ${product.title}`, { productId, checkoutReferenceId: normalized });
    return updated;
  }

  /** Checkout TheMembers: x-signature é o token estático configurado no webhook. */
  verifyCheckoutWebhookToken(signature?: string) {
    const expected = this.config.get<string>("THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN")?.trim();
    if (!expected) throw new ServiceUnavailableException("THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN não configurado");
    if (!signature) throw new UnauthorizedException("x-signature ausente");
    this.safeEqual(expected, signature.trim(), "Token do webhook TheMembers inválido");
  }

  /** Webhook da área de membros/plataforma: HMAC-SHA256 sobre o raw body. */
  verifyPlatformWebhook(rawBody: Buffer, signature?: string) {
    const secret = this.config.get<string>("THEMEMBERS_PLATFORM_WEBHOOK_CLIENT_TOKEN")?.trim();
    if (!secret) throw new ServiceUnavailableException("THEMEMBERS_PLATFORM_WEBHOOK_CLIENT_TOKEN não configurado");
    if (!signature) throw new UnauthorizedException("X-Webhook-Signature ausente");
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    this.safeEqual(expected, signature.trim().toLowerCase(), "Assinatura TheMembers inválida", "hex");
  }

  async receiveWebhook(rawBody: Buffer, eventHeader?: string, source: WebhookSource = "CHECKOUT"): Promise<any> {
    const raw = rawBody.toString("utf8");
    let payload: Record<string, any>;
    try { payload = JSON.parse(raw) as Record<string, any>; }
    catch { throw new BadRequestException("Payload JSON inválido"); }

    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    const envelope = payload.payload ?? payload;
    const eventType = String(eventHeader || envelope.event || payload.event || payload.action || payload.type || "unknown");
    const explicitId = envelope.id ?? payload.id ?? payload.event_id ?? envelope.data?.id ?? payload.data?.id;
    const eventKey = explicitId ? `${source}:${eventType}:${String(explicitId)}` : `${source}:${eventType}:${payloadHash}`;

    const claim = await this.claimWebhookEvent(eventKey, eventType, payloadHash, payload);
    if (claim.duplicate) return { received: true, duplicate: true, status: claim.event.status };
    if (!this.jobs) return this.processWebhookEvent(claim.event);

    let dispatch;
    try {
      dispatch = await this.jobs.dispatch(
        AcademyJob.THEMEMBERS_ENROLLMENT_SYNC,
        { eventId: claim.event.id },
        { jobId: `themembers-event-${claim.event.id}` },
      );
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: { id: claim.event.id },
        data: { status: "FAILED", processedAt: new Date(), error: "queue_dispatch_failed" },
      });
      throw error;
    }
    if (dispatch.mode === "inline") return dispatch.result;
    return { received: true, status: "RECEIVED", queued: true, queue: dispatch.queue, jobId: dispatch.jobId };
  }

  async processClaimedWebhookEvent(eventId: string) {
    const event = await this.prisma.webhookEvent.findUnique({ where: { id: eventId } });
    if (!event || event.provider !== "THEMEMBERS") throw new BadRequestException("Evento TheMembers não encontrado");
    return this.processWebhookEvent(event);
  }

  private async processWebhookEvent(event: any) {
    if (event.status === "PROCESSED" || event.status === "IGNORED") {
      return { received: true, duplicate: true, status: event.status };
    }

    const payload = event.payload as Record<string, any>;
    const source: WebhookSource = event.eventKey.startsWith("PLATFORM:") ? "PLATFORM" : "CHECKOUT";
    try {
      const result = await this.processAccessEvent(event.eventType, payload, source);
      const status = result.processed ? "PROCESSED" : "IGNORED";
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { status, processedAt: new Date(), error: result.reason ?? null } });
      return { received: true, status, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao processar webhook TheMembers";
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "FAILED", error: message, processedAt: new Date() } });
      await this.log("ERROR", "webhook.process", message, { source, eventType: event.eventType, eventKey: event.eventKey });
      throw error;
    }
  }

  async reconcileBackgroundState() {
    const startedAt = Date.now();
    const integration = this.status();
    let products: unknown = { skipped: true };
    const courses: Array<{ externalId: string; ok: boolean; error?: string }> = [];

    if (integration.apiConfigured) products = await this.syncProducts();
    if (integration.coursesApiConfigured && this.booleanConfig("THEMEMBERS_BACKGROUND_SYNC_COURSES", true)) {
      const limit = this.numberConfig("THEMEMBERS_RECONCILE_COURSE_LIMIT", 25, 1, 100);
      const imported = await this.prisma.course.findMany({
        where: { sourceProvider: "THEMEMBERS", sourceExternalId: { not: null } },
        select: { sourceExternalId: true },
        take: limit,
        orderBy: { sourceSyncedAt: "asc" },
      });
      for (const item of imported) {
        const externalId = item.sourceExternalId!;
        try {
          await this.importRemoteCourse(externalId);
          courses.push({ externalId, ok: true });
        } catch (error) {
          courses.push({ externalId, ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    const now = new Date();
    const subscriptions = await this.prisma.externalSubscription.findMany({
      where: { provider: "THEMEMBERS" },
      include: { externalProduct: { include: { courses: { select: { courseId: true } } } } },
    });
    const affected = new Set<string>();
    let grantsActivated = 0;
    let grantsCancelled = 0;

    for (const subscription of subscriptions) {
      const key = (courseId: string) => `${subscription.userId}:${courseId}`;
      const mappedCourseIds = subscription.externalProduct.courses.map(item => item.courseId);
      const existing = await this.prisma.externalAccessGrant.findMany({
        where: { provider: "THEMEMBERS", userId: subscription.userId, externalProductId: subscription.externalProductId },
        select: { courseId: true, status: true },
      });
      existing.forEach(grant => affected.add(key(grant.courseId)));
      mappedCourseIds.forEach(courseId => affected.add(key(courseId)));

      const active = subscription.status === "ACTIVE" && (!subscription.expiresAt || subscription.expiresAt > now);
      if (!active) {
        const result = await this.prisma.externalAccessGrant.updateMany({
          where: { provider: "THEMEMBERS", userId: subscription.userId, externalProductId: subscription.externalProductId, status: "ACTIVE" },
          data: { status: "CANCELLED" },
        });
        grantsCancelled += result.count;
        continue;
      }

      const result = await this.prisma.externalAccessGrant.updateMany({
        where: {
          provider: "THEMEMBERS",
          userId: subscription.userId,
          externalProductId: subscription.externalProductId,
          ...(mappedCourseIds.length ? { courseId: { notIn: mappedCourseIds } } : {}),
          status: "ACTIVE",
        },
        data: { status: "CANCELLED" },
      });
      grantsCancelled += result.count;
      for (const courseId of mappedCourseIds) {
        await this.prisma.externalAccessGrant.upsert({
          where: {
            provider_userId_courseId_externalProductId: {
              provider: "THEMEMBERS",
              userId: subscription.userId,
              courseId,
              externalProductId: subscription.externalProductId,
            },
          },
          update: { status: "ACTIVE", expiresAt: subscription.expiresAt },
          create: {
            provider: "THEMEMBERS",
            userId: subscription.userId,
            courseId,
            externalProductId: subscription.externalProductId,
            status: "ACTIVE",
            expiresAt: subscription.expiresAt,
          },
        });
        grantsActivated += 1;
      }
    }

    const themembersEnrollments = await this.prisma.enrollment.findMany({
      where: { source: "THEMEMBERS" },
      select: { userId: true, courseId: true },
    });
    themembersEnrollments.forEach(item => affected.add(`${item.userId}:${item.courseId}`));

    let sessionsBlocked = 0;
    for (const pair of affected) {
      const separator = pair.indexOf(":");
      const userId = pair.slice(0, separator);
      const courseId = pair.slice(separator + 1);
      const enrollment = await this.recomputeEffectiveEnrollment(userId, courseId);
      const hasAccess = enrollment?.status === "ACTIVE"
        && enrollment.startsAt <= now
        && (!enrollment.expiresAt || enrollment.expiresAt > now);
      if (!hasAccess) {
        const result = await this.prisma.watchSession.updateMany({
          where: { userId, status: "ACTIVE", lesson: { module: { courseId } } },
          data: { status: "BLOCKED", endedAt: now, blockReason: "themembers_access_reconciled" },
        });
        sessionsBlocked += result.count;
      }
    }

    const preservedProgress = await this.prisma.lessonProgress.count({
      where: { lesson: { sourceProvider: "THEMEMBERS" } },
    });
    const summary = {
      ok: true,
      products,
      courses,
      subscriptions: subscriptions.length,
      grantsActivated,
      grantsCancelled,
      enrollmentsRecomputed: affected.size,
      sessionsBlocked,
      preservedProgress,
      durationMs: Date.now() - startedAt,
    };
    await this.log("INFO", "background.reconcile", "Reconciliação TheMembers concluída", summary);
    return summary;
  }

  listEvents(limit = 50) {
    return this.prisma.webhookEvent.findMany({ where: { provider: "THEMEMBERS" }, orderBy: { receivedAt: "desc" }, take: Math.min(100, Math.max(1, limit)) });
  }

  listLogs(limit = 50) {
    return this.prisma.integrationLog.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(100, Math.max(1, limit)) });
  }


  /**
   * Reserva um evento de forma serializada no PostgreSQL. Evita que duas entregas
   * simultâneas processem o mesmo webhook e permite recuperar um RECEIVED que ficou
   * órfão após queda do processo.
   */
  private claimWebhookEvent(eventKey: string, eventType: string, payloadHash: string, payload: Record<string, any>) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`THEMEMBERS:${eventKey}`}))`;
      const existing = await tx.webhookEvent.findUnique({ where: { provider_eventKey: { provider: "THEMEMBERS", eventKey } } });
      if (!existing) {
        const event = await tx.webhookEvent.create({
          data: { provider: "THEMEMBERS", eventKey, eventType, payloadHash, payload: payload as any },
        });
        return { event, duplicate: false };
      }

      const receivedIsStale = existing.status === "RECEIVED" && existing.receivedAt.getTime() < Date.now() - 120_000;
      if (existing.status === "FAILED" || receivedIsStale) {
        const event = await tx.webhookEvent.update({
          where: { id: existing.id },
          data: {
            status: "RECEIVED",
            error: null,
            processedAt: null,
            receivedAt: new Date(),
            eventType,
            payloadHash,
            payload: payload as any,
          },
        });
        return { event, duplicate: false };
      }

      return { event: existing, duplicate: true };
    });
  }

  private async processAccessEvent(eventType: string, payload: Record<string, any>, source: WebhookSource) {
    const integrationEnabled = String(this.config.get("THEMEMBERS_ENABLED") ?? "false").toLowerCase() === "true";
    if (!integrationEnabled) return { processed: false, reason: "integration_disabled" };
    const automationEnabled = String(this.config.get("THEMEMBERS_ACCESS_AUTOMATION") ?? "false").toLowerCase() === "true";
    if (!automationEnabled) return { processed: false, reason: "access_automation_disabled" };

    const grantEvents = new Set(["release.access", ...this.eventList("THEMEMBERS_GRANT_EVENTS")]);
    const revokeEvents = new Set(["revoke.access", ...this.eventList("THEMEMBERS_REVOKE_EVENTS")]);
    const grant = grantEvents.has(eventType);
    const revoke = revokeEvents.has(eventType);
    if (!grant && !revoke) return { processed: false, reason: "event_not_configured_for_access" };

    const normalized = source === "CHECKOUT" ? this.normalizeCheckoutPayload(payload) : this.normalizeGenericPayload(payload);
    if (!normalized.email || !normalized.productRefs.length) return { processed: false, reason: "missing_email_or_product" };
    const productRefs = [...new Set(normalized.productRefs.filter(Boolean))];
    const product = await this.prisma.externalProduct.findFirst({
      where: {
        provider: "THEMEMBERS",
        OR: productRefs.flatMap(ref => [
          { externalId: ref },
          { productCode: ref },
          { checkoutReferenceId: ref },
        ]),
      },
      include: { courses: true },
    });
    if (!product) return { processed: false, reason: "product_not_synced" };
    if (!product.courses.length) return { processed: false, reason: "product_without_course_mapping" };

    let user = await this.prisma.user.findUnique({ where: { email: normalized.email } });
    let created = false;
    if (!user && grant) {
      user = await this.prisma.user.create({ data: { name: normalized.name || normalized.email.split("@")[0], email: normalized.email, role: "STUDENT", status: "ACTIVE" } });
      created = true;
    }
    if (!user) return { processed: false, reason: "user_not_found_for_revoke" };

    if (normalized.customerId) {
      const byExternal = await this.prisma.externalCustomer.findUnique({ where: { provider_externalId: { provider: "THEMEMBERS", externalId: normalized.customerId } } });
      if (byExternal && byExternal.userId !== user.id) {
        throw new BadRequestException("O cliente externo TheMembers já está ligado a outro usuário Casa do Ads");
      }
      await this.prisma.externalCustomer.upsert({
        where: { provider_userId: { provider: "THEMEMBERS", userId: user.id } },
        update: { externalId: normalized.customerId, email: normalized.email, raw: payload as any },
        create: { provider: "THEMEMBERS", externalId: normalized.customerId, userId: user.id, email: normalized.email, raw: payload as any },
      });
    }

    await this.prisma.externalSubscription.upsert({
      where: { provider_userId_externalProductId: { provider: "THEMEMBERS", userId: user.id, externalProductId: product.id } },
      update: { externalSubscriptionId: normalized.subscriptionId, status: grant ? "ACTIVE" : "CANCELLED", paymentLastDate: normalized.paymentLastDate, expiresAt: normalized.expiresAt, raw: payload as any },
      create: { provider: "THEMEMBERS", externalSubscriptionId: normalized.subscriptionId, userId: user.id, externalProductId: product.id, status: grant ? "ACTIVE" : "CANCELLED", paymentLastDate: normalized.paymentLastDate, expiresAt: normalized.expiresAt, raw: payload as any },
    });

    if (grant) {
      const mappedCourseIds = product.courses.map(item => item.courseId);
      const previousGrants = await this.prisma.externalAccessGrant.findMany({
        where: { provider: "THEMEMBERS", userId: user.id, externalProductId: product.id },
        select: { courseId: true },
      });
      // Se o mapeamento comercial mudou, grants antigos deste produto não podem ficar ativos para sempre.
      if (mappedCourseIds.length) {
        await this.prisma.externalAccessGrant.updateMany({
          where: { provider: "THEMEMBERS", userId: user.id, externalProductId: product.id, courseId: { notIn: mappedCourseIds } },
          data: { status: "CANCELLED" },
        });
      }
      for (const courseId of mappedCourseIds) {
        await this.prisma.externalAccessGrant.upsert({
          where: { provider_userId_courseId_externalProductId: { provider: "THEMEMBERS", userId: user.id, courseId, externalProductId: product.id } },
          update: { status: "ACTIVE", startsAt: new Date(), expiresAt: normalized.expiresAt },
          create: { provider: "THEMEMBERS", userId: user.id, courseId, externalProductId: product.id, status: "ACTIVE", startsAt: new Date(), expiresAt: normalized.expiresAt },
        });
      }
      const affectedCourseIds = [...new Set([...mappedCourseIds, ...previousGrants.map(item => item.courseId)])];
      for (const courseId of affectedCourseIds) await this.recomputeEffectiveEnrollment(user.id, courseId);

      if (created && String(this.config.get("THEMEMBERS_SEND_INVITES") ?? "false").toLowerCase() === "true") {
        try {
          const invite = await this.auth.sendInvite(user.id);
          if ("delivered" in invite && !invite.delivered) await this.log("WARN", "invite.send", "Usuário criado, mas convite não foi enviado", { userId: user.id });
        }
        catch (error) { await this.log("WARN", "invite.send", "Usuário criado, mas convite não foi enviado", { userId: user.id, error: error instanceof Error ? error.message : String(error) }); }
      }
      await this.log("INFO", "access.grant", `Acesso liberado via TheMembers para ${user.email}`, { source, eventType, productId: product.id, courses: mappedCourseIds });
    } else {
      const grants = await this.prisma.externalAccessGrant.findMany({
        where: { provider: "THEMEMBERS", userId: user.id, externalProductId: product.id },
        select: { courseId: true },
      });
      await this.prisma.externalAccessGrant.updateMany({
        where: { provider: "THEMEMBERS", userId: user.id, externalProductId: product.id, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      });
      const courseIds = [...new Set(grants.map(item => item.courseId))];
      for (const courseId of courseIds) await this.recomputeEffectiveEnrollment(user.id, courseId);

      // Só derruba sessões de cursos que realmente deixaram de ter acesso efetivo.
      const noAccessCourseIds: string[] = [];
      const now = new Date();
      for (const courseId of courseIds) {
        const enrollment = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
        const valid = enrollment?.status === "ACTIVE" && enrollment.startsAt <= now && (!enrollment.expiresAt || enrollment.expiresAt > now);
        if (!valid) noAccessCourseIds.push(courseId);
      }
      if (noAccessCourseIds.length) {
        const lessons = await this.prisma.lesson.findMany({ where: { module: { courseId: { in: noAccessCourseIds } } }, select: { id: true } });
        await this.prisma.watchSession.updateMany({ where: { userId: user.id, status: "ACTIVE", lessonId: { in: lessons.map(item => item.id) } }, data: { status: "BLOCKED", endedAt: new Date(), blockReason: "themembers_access_revoked" } });
      }
      await this.log("INFO", "access.revoke", `Acesso removido/recalculado via TheMembers para ${user.email}`, { source, eventType, productId: product.id, courseIds });
    }

    return { processed: true, action: grant ? "granted" : "revoked", userId: user.id, productId: product.id, createdUser: created };
  }

  private normalizeCheckoutPayload(payload: Record<string, any>) {
    const envelope = payload.payload ?? payload;
    const data = envelope.data ?? {};
    const customer = data.customer ?? data.order?.customer ?? data.subscription?.subscriber ?? {};
    const product = data.product ?? data.subscription?.product ?? data.order?.main_product ?? {};
    return {
      email: this.firstString(customer.email)?.toLowerCase(),
      name: this.firstString(customer.name),
      // O Checkout pode expor mais de um identificador. Mantemos todos os candidatos
      // e fazemos o casamento contra IDs sincronizados + alias configurável no admin.
      productRefs: [
        this.firstString(product.reference_id),
        this.firstString(product.product_id),
        this.firstString(product.id),
      ].filter((value): value is string => Boolean(value)),
      customerId: this.firstString(customer.id),
      subscriptionId: this.firstString(data.subscription?.code, data.subscription?.id, data.order?.id, envelope.id),
      expiresAt: this.dateOrNull(product.expires_in ?? data.subscription?.next_billing_at ?? data.expiration_date),
      paymentLastDate: this.dateOrNull(data.order?.transaction?.paid_at ?? data.paid_at ?? data.subscription?.invoice?.paid_at),
    };
  }

  private normalizeGenericPayload(payload: Record<string, any>) {
    const data = payload.data ?? payload;
    const email = this.firstString(data?.student?.email, data?.user?.email, data?.customer?.email, payload?.student?.email, payload?.customer?.email, data?.email, payload?.email)?.toLowerCase();
    const name = this.firstString(data?.student?.name, data?.user?.name, data?.customer?.name, payload?.customer?.name, data?.name, payload?.name);
    const productRefs = [
      data?.product?.reference_id, data?.product?.product_id, data?.product?.id, data?.subscription?.product_id, data?.product_id,
      payload?.product?.reference_id, payload?.product?.product_id, payload?.product?.id, payload?.product_id,
    ].map(value => this.firstString(value)).filter((value): value is string => Boolean(value));
    const customerId = this.firstString(data?.student?.id, data?.user?.id, data?.customer?.id, payload?.customer?.id, data?.customer_id);
    const subscriptionId = this.firstString(data?.subscription?.id, data?.subscription?.code, payload?.subscription?.id, data?.subscription_id);
    return {
      email, name, productRefs, customerId, subscriptionId,
      expiresAt: this.dateOrNull(data?.subscription?.expiration_date ?? data?.subscription?.next_billing_at ?? data?.expiration_date ?? payload?.expiration_date),
      paymentLastDate: this.dateOrNull(data?.subscription?.payment_last_date ?? data?.paid_at ?? data?.payment_last_date ?? payload?.payment_last_date),
    };
  }

  private async recomputeEffectiveEnrollment(userId: string, courseId: string) {
    const now = new Date();
    const existing = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });

    // Uma matrícula ativa concedida manualmente ou por outra origem é soberana e nunca é removida pela TheMembers.
    const existingValid = existing?.status === "ACTIVE" && existing.startsAt <= now && (!existing.expiresAt || existing.expiresAt > now);
    if (existing && existingValid && existing.source && existing.source !== "THEMEMBERS") return existing;

    const grants = await this.prisma.externalAccessGrant.findMany({
      where: {
        provider: "THEMEMBERS",
        userId,
        courseId,
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { expiresAt: true, startsAt: true },
    });

    if (!grants.length) {
      if (existing?.source === "THEMEMBERS") {
        return this.prisma.enrollment.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });
      }
      return existing;
    }

    // Qualquer grant sem expiração torna o acesso efetivo vitalício; caso contrário usamos a maior validade.
    const expiresAt = grants.some(grant => grant.expiresAt === null)
      ? null
      : new Date(Math.max(...grants.map(grant => grant.expiresAt!.getTime())));
    const startsAt = new Date(Math.min(...grants.map(grant => grant.startsAt.getTime())));

    return this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: { status: "ACTIVE", source: "THEMEMBERS", startsAt, expiresAt },
      create: { userId, courseId, status: "ACTIVE", source: "THEMEMBERS", startsAt, expiresAt },
    });
  }

  private async fetchProducts(): Promise<ExternalProductPayload[]> {
    const mode = String(this.config.get("THEMEMBERS_API_MODE") ?? "legacy").toLowerCase();
    if (mode === "v1") {
      const token = this.config.get<string>("THEMEMBERS_API_TOKEN")?.trim();
      const endpoint = this.config.get<string>("THEMEMBERS_PRODUCTS_ENDPOINT")?.trim();
      if (!token || !endpoint) throw new ServiceUnavailableException("Modo v1 exige THEMEMBERS_API_TOKEN e THEMEMBERS_PRODUCTS_ENDPOINT. Informe a rota oficial do seu tenant em vez de presumirmos uma URL.");
      const response = await this.externalFetch(endpoint, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new ServiceUnavailableException(`TheMembers v1 respondeu HTTP ${response.status}`);
      return this.extractProducts(body);
    }
    const developer = this.config.get<string>("THEMEMBERS_DEVELOPER_TOKEN")?.trim();
    const platform = this.config.get<string>("THEMEMBERS_PLATFORM_TOKEN")?.trim();
    if (!developer || !platform) throw new ServiceUnavailableException("THEMEMBERS_DEVELOPER_TOKEN/THEMEMBERS_PLATFORM_TOKEN não configurados");
    const base = (this.config.get<string>("THEMEMBERS_API_BASE") ?? "https://registration.themembers.dev.br/api").replace(/\/$/, "");
    const url = `${base}/products/all-products/${encodeURIComponent(developer)}/${encodeURIComponent(platform)}`;
    const response = await this.externalFetch(url, { headers: { Accept: "application/json" } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ServiceUnavailableException(`TheMembers respondeu HTTP ${response.status}`);
    return this.extractProducts(body);
  }

  private async fetchCourses(): Promise<ExternalCoursePayload[]> {
    const token = this.config.get<string>("THEMEMBERS_API_TOKEN")?.trim();
    if (!token) throw new ServiceUnavailableException("THEMEMBERS_API_TOKEN não configurado. Gere um API Token v1 no painel da TheMembers.");
    const endpoint = this.config.get<string>("THEMEMBERS_COURSES_ENDPOINT")?.trim() || "https://api.themembers.com.br/api/v1/courses";
    let initial: URL;
    try { initial = new URL(endpoint); }
    catch { throw new ServiceUnavailableException("THEMEMBERS_COURSES_ENDPOINT possui uma URL inválida"); }
    if (!/^https?:$/.test(initial.protocol)) throw new ServiceUnavailableException("THEMEMBERS_COURSES_ENDPOINT deve usar HTTP ou HTTPS");

    const pages = new Set<string>();
    const courses = new Map<string, ExternalCoursePayload>();
    let next: string | null = initial.toString();

    while (next && pages.size < 100) {
      const current = new URL(next, initial);
      if (current.origin !== initial.origin) throw new ServiceUnavailableException("A paginação da TheMembers apontou para um domínio inesperado");
      if (pages.has(current.toString())) break;
      pages.add(current.toString());

      const response = await this.externalFetch(current, { redirect: "error", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new ServiceUnavailableException(`TheMembers cursos respondeu HTTP ${response.status}`);
      for (const course of this.extractCourses(body)) {
        const id = this.firstString(course.id);
        if (id) courses.set(id, course);
      }
      next = this.nextCoursesPage(body, current);
    }

    return [...courses.values()];
  }

  private extractProducts(body: any): ExternalProductPayload[] {
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.products)) return body.products;
    return [];
  }

  private extractCourses(body: any): ExternalCoursePayload[] {
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.courses)) return body.courses;
    return [];
  }

  private nextCoursesPage(body: any, current: URL) {
    const candidate = body?.links?.next ?? body?.meta?.next_page_url ?? body?.next_page_url ?? null;
    if (typeof candidate !== "string" || !candidate.trim()) return null;
    try { return new URL(candidate, current).toString(); }
    catch { throw new ServiceUnavailableException("A TheMembers retornou uma paginação inválida para cursos"); }
  }

  private async externalFetch(input: string | URL, init: RequestInit) {
    try {
      return await fetch(input, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(THEMEMBERS_API_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException("TheMembers indisponível ou fora do tempo limite");
    }
  }

  private normalizeCourse(course: ExternalCoursePayload) {
    const id = this.firstString(course.id);
    if (!id) return null;
    const modules = (Array.isArray(course.modules) ? course.modules : []).map(module => this.normalizeModule(module)).filter((module): module is NonNullable<typeof module> => Boolean(module));
    return {
      id,
      title: this.firstString(course.title) ?? `Curso ${id}`,
      description: typeof course.description === "string" ? course.description : null,
      status: course.status == null ? null : String(course.status),
      slug: this.firstString(course.slug) ?? "",
      blocked: this.externalBoolean(course.blocked),
      published: this.externalBoolean(course.published),
      modules,
    };
  }

  private normalizeModule(module: ExternalModulePayload) {
    const id = this.firstString(module.id);
    if (!id) return null;
    const lessons = (Array.isArray(module.lessons) ? module.lessons : []).map(lesson => this.normalizeLesson(lesson)).filter((lesson): lesson is NonNullable<typeof lesson> => Boolean(lesson));
    return {
      id,
      title: this.firstString(module.title) ?? `Módulo ${id}`,
      description: typeof module.description === "string" ? module.description : null,
      slug: this.firstString(module.slug) ?? "",
      blocked: this.externalBoolean(module.blocked),
      published: this.externalBoolean(module.published),
      lessons,
    };
  }

  private normalizeLesson(lesson: ExternalLessonPayload) {
    const id = this.firstString(lesson.id);
    if (!id) return null;
    return {
      id,
      title: this.firstString(lesson.title) ?? `Aula ${id}`,
      subtitle: typeof lesson.subtitle === "string" ? lesson.subtitle : null,
      slug: this.firstString(lesson.slug) ?? "",
      blocked: this.externalBoolean(lesson.blocked),
      published: this.externalBoolean(lesson.published),
    };
  }

  private async uniqueCourseSlug(tx: any, value: string, externalId: string) {
    const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const base = normalized || `curso-themembers-${externalId.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
    let candidate = base;
    let attempt = 1;
    while (await tx.course.findUnique({ where: { slug: candidate }, select: { id: true } })) candidate = `${base}-${++attempt}`;
    return candidate;
  }

  private shortDescription(value: string | null) {
    if (!value) return null;
    const plain = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plain.length > 180 ? `${plain.slice(0, 177).trimEnd()}...` : plain || null;
  }

  private async resequence(
    items: Array<{ id: string; position: number }>,
    preferredIds: string[],
    update: (id: string, position: number) => Promise<unknown>,
  ) {
    if (!items.length) return;
    const ids = new Set(items.map(item => item.id));
    const preferred = [...new Set(preferredIds)].filter(id => ids.has(id));
    const preferredSet = new Set(preferred);
    const preserved = items.filter(item => !preferredSet.has(item.id)).sort((a, b) => a.position - b.position).map(item => item.id);
    const ordered = [...preferred, ...preserved];
    let temporaryPosition = Math.max(0, ...items.map(item => item.position)) + items.length + 1;
    for (const item of items) await update(item.id, temporaryPosition++);
    for (let index = 0; index < ordered.length; index++) await update(ordered[index], index + 1);
  }

  private eventList(key: string) {
    return String(this.config.get(key) ?? "").split(",").map(value => value.trim()).filter(Boolean);
  }
  private booleanConfig(key: string, fallback: boolean) {
    const value = this.config.get(key);
    return value == null ? fallback : ["1", "true", "yes", "sim"].includes(String(value).trim().toLowerCase());
  }
  private numberConfig(key: string, fallback: number, minimum: number, maximum: number) {
    const value = Number(this.config.get(key) ?? fallback);
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback;
  }
  private externalBoolean(value: unknown) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    return ["1", "true", "yes", "sim", "published", "active"].includes(String(value ?? "").trim().toLowerCase());
  }
  private firstString(...values: unknown[]) { const found = values.find(value => typeof value === "string" || typeof value === "number"); return found == null ? undefined : String(found).trim() || undefined; }
  private dateOrNull(value: unknown) { if (!value) return null; const text = String(value).trim(); const date = new Date(text.includes("T") ? text : text.replace(" ", "T")); return Number.isNaN(date.getTime()) ? null : date; }
  private safeEqual(expected: string, provided: string, message: string, encoding: BufferEncoding = "utf8") {
    let a: Buffer; let b: Buffer;
    try { a = Buffer.from(expected, encoding); b = Buffer.from(provided, encoding); }
    catch { throw new UnauthorizedException(message); }
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException(message);
  }
  private log(level: string, action: string, message: string, metadata?: Record<string, unknown>) { return this.prisma.integrationLog.create({ data: { provider: "THEMEMBERS", level, action, message, metadata: metadata as any } }); }
}
