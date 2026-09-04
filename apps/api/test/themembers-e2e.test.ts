import assert from "node:assert/strict";
import { test } from "node:test";
import { ExperienceService } from "../src/experience/experience.service";
import { TheMembersService } from "../src/integrations/themembers.service";
import { TheMembersWebhookController } from "../src/integrations/themembers-webhook.controller";
import { config } from "./helpers";

type ProductRow = {
  id: string;
  provider: "THEMEMBERS";
  externalId: string;
  productCode: string | null;
  checkoutReferenceId: string;
  courses: Array<{ courseId: string }>;
};

function officialAccessPayload(input: {
  event: "release.access" | "revoke.access";
  orderId: string;
  productId: string;
  referenceId: string;
}) {
  return Buffer.from(JSON.stringify({
    company: { id: "company-1", name: "Academy" },
    payload: {
      id: input.orderId,
      object: "order",
      event: input.event,
      created_at: "2026-08-18 15:00:00",
      data: {
        status: input.event === "release.access" ? "paid" : "cancelled",
        customer: {
          id: "customer-1",
          name: "Aluno Ponta a Ponta",
          email: "ALUNO.E2E@EXAMPLE.COM",
          phone: "+55 11999999999",
        },
        product: {
          id: input.productId,
          name: "Produto Academy",
          price: 10000,
          quantity: 1,
          expires_in: "2030-01-08 18:32:19",
          reference_id: input.referenceId,
          platform: { id: "platform-1", name: "Academy" },
        },
        order: {
          id: input.orderId,
          total: 10000,
          transaction: {
            paid_at: "2026-08-18 15:00:00",
            payment_method: "credit_card",
            status: input.event === "release.access" ? "approved" : "refunded",
          },
        },
      },
    },
  }));
}

function statefulHarness() {
  const products: ProductRow[] = [
    {
      id: "product-a",
      provider: "THEMEMBERS",
      externalId: "platform-product-a",
      productCode: "checkout-product-id-a",
      checkoutReferenceId: "checkout-reference-a",
      courses: [{ courseId: "course-exclusive" }, { courseId: "course-shared" }],
    },
    {
      id: "product-b",
      provider: "THEMEMBERS",
      externalId: "platform-product-b",
      productCode: "checkout-product-id-b",
      checkoutReferenceId: "checkout-reference-b",
      courses: [{ courseId: "course-shared" }],
    },
  ];
  const courses = [
    {
      id: "course-exclusive",
      slug: "curso-exclusivo",
      title: "Curso Exclusivo",
      shortDescription: null,
      description: null,
      cardImageUrl: null,
      heroImageUrl: null,
      featured: false,
      status: "PUBLISHED",
      publishedAt: new Date("2026-08-01T00:00:00Z"),
      createdAt: new Date("2026-07-01T00:00:00Z"),
      categories: [],
      modules: [{ id: "module-exclusive", position: 1, lessons: [{ id: "lesson-exclusive", title: "Aula exclusiva", durationSec: 600, position: 1 }] }],
    },
    {
      id: "course-shared",
      slug: "curso-compartilhado",
      title: "Curso Compartilhado",
      shortDescription: null,
      description: null,
      cardImageUrl: null,
      heroImageUrl: null,
      featured: false,
      status: "PUBLISHED",
      publishedAt: new Date("2026-08-02T00:00:00Z"),
      createdAt: new Date("2026-07-02T00:00:00Z"),
      categories: [],
      modules: [{ id: "module-shared", position: 1, lessons: [{ id: "lesson-shared", title: "Aula compartilhada", durationSec: 900, position: 1 }] }],
    },
  ];
  const users: any[] = [];
  const customers: any[] = [];
  const subscriptions: any[] = [];
  const grants: any[] = [];
  const enrollments: any[] = [];
  const webhookEvents: any[] = [];
  const logs: any[] = [];
  const watchSessions: any[] = [];
  let sequence = 0;

  const selected = (row: any, select?: Record<string, boolean>) => {
    if (!select) return row;
    return Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]]));
  };
  const matchGrant = (row: any, where: any) => {
    if (where.provider && row.provider !== where.provider) return false;
    if (where.userId && row.userId !== where.userId) return false;
    if (where.externalProductId && row.externalProductId !== where.externalProductId) return false;
    if (typeof where.courseId === "string" && row.courseId !== where.courseId) return false;
    if (where.courseId?.notIn?.includes(row.courseId)) return false;
    if (where.status && row.status !== where.status) return false;
    if (where.startsAt?.lte && row.startsAt > where.startsAt.lte) return false;
    if (where.OR) {
      const matchesExpiry = where.OR.some((condition: any) => {
        if (condition.expiresAt === null) return row.expiresAt === null;
        if (condition.expiresAt?.gt) return row.expiresAt instanceof Date && row.expiresAt > condition.expiresAt.gt;
        return false;
      });
      if (!matchesExpiry) return false;
    }
    return true;
  };
  const findEnrollment = (where: any) => {
    if (where.id) return enrollments.find(item => item.id === where.id) ?? null;
    const key = where.userId_courseId;
    return enrollments.find(item => item.userId === key.userId && item.courseId === key.courseId) ?? null;
  };

  const prisma: any = {
    $executeRaw: async () => 0,
    externalProduct: {
      findFirst: async ({ where }: any) => products.find(product =>
        product.provider === where.provider && where.OR.some((condition: any) =>
          Object.entries(condition).some(([key, value]) => (product as any)[key] === value),
        ),
      ) ?? null,
    },
    user: {
      findUnique: async ({ where }: any) => users.find(user => user.email === where.email) ?? null,
      create: async ({ data }: any) => {
        const user = { id: `user-${++sequence}`, ...data };
        users.push(user);
        return user;
      },
    },
    externalCustomer: {
      findUnique: async ({ where }: any) => {
        const key = where.provider_externalId;
        return customers.find(item => item.provider === key.provider && item.externalId === key.externalId) ?? null;
      },
      upsert: async ({ where, update, create }: any) => {
        const key = where.provider_userId;
        const existing = customers.find(item => item.provider === key.provider && item.userId === key.userId);
        if (existing) { Object.assign(existing, update); return existing; }
        const customer = { id: `customer-${++sequence}`, ...create };
        customers.push(customer);
        return customer;
      },
    },
    externalSubscription: {
      upsert: async ({ where, update, create }: any) => {
        const key = where.provider_userId_externalProductId;
        const existing = subscriptions.find(item => item.provider === key.provider && item.userId === key.userId && item.externalProductId === key.externalProductId);
        if (existing) { Object.assign(existing, update); return existing; }
        const subscription = { id: `subscription-${++sequence}`, ...create };
        subscriptions.push(subscription);
        return subscription;
      },
    },
    externalAccessGrant: {
      findMany: async ({ where, select }: any) => grants.filter(row => matchGrant(row, where)).map(row => selected(row, select)),
      updateMany: async ({ where, data }: any) => {
        const matches = grants.filter(row => matchGrant(row, where));
        matches.forEach(row => Object.assign(row, data));
        return { count: matches.length };
      },
      upsert: async ({ where, update, create }: any) => {
        const key = where.provider_userId_courseId_externalProductId;
        const existing = grants.find(item => item.provider === key.provider && item.userId === key.userId && item.courseId === key.courseId && item.externalProductId === key.externalProductId);
        if (existing) { Object.assign(existing, update); return existing; }
        const grant = { id: `grant-${++sequence}`, ...create };
        grants.push(grant);
        return grant;
      },
    },
    enrollment: {
      findUnique: async ({ where }: any) => findEnrollment(where),
      count: async ({ where }: any) => enrollments
        .filter(item => item.userId === where.userId)
        .filter(item => !where.status || item.status === where.status)
        .filter(item => !where.startsAt?.lte || item.startsAt <= where.startsAt.lte)
        .filter(item => !where.OR || where.OR.some((condition: any) => condition.expiresAt === null ? item.expiresAt === null : item.expiresAt > condition.expiresAt.gt))
        .length,
      findMany: async ({ where, select, skip = 0, take }: any) => enrollments
        .filter(item => item.userId === where.userId)
        .filter(item => !where.courseId?.in || where.courseId.in.includes(item.courseId))
        .filter(item => !where.status || item.status === where.status)
        .filter(item => !where.startsAt?.lte || item.startsAt <= where.startsAt.lte)
        .filter(item => !where.OR || where.OR.some((condition: any) => condition.expiresAt === null ? item.expiresAt === null : item.expiresAt > condition.expiresAt.gt))
        .slice(skip, take === undefined ? undefined : skip + take)
        .map(item => selected(item, select)),
      update: async ({ where, data }: any) => {
        const existing = findEnrollment(where);
        if (!existing) throw new Error("Enrollment ausente no double");
        Object.assign(existing, data);
        return existing;
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = findEnrollment(where);
        if (existing) { Object.assign(existing, update); return existing; }
        const enrollment = { id: `enrollment-${++sequence}`, ...create };
        enrollments.push(enrollment);
        return enrollment;
      },
    },
    lesson: {
      findMany: async ({ where }: any) => {
        const courseIds: string[] = where.module.courseId.in;
        return courses.flatMap(course => courseIds.includes(course.id) ? course.modules.flatMap(module => module.lessons.map(lesson => ({ id: lesson.id }))) : []);
      },
    },
    watchSession: {
      updateMany: async ({ where, data }: any) => {
        const matches = watchSessions.filter(item => item.userId === where.userId && item.status === where.status && where.lessonId.in.includes(item.lessonId));
        matches.forEach(item => Object.assign(item, data));
        return { count: matches.length };
      },
    },
    webhookEvent: {
      findUnique: async ({ where }: any) => {
        const key = where.provider_eventKey;
        return webhookEvents.find(item => item.provider === key.provider && item.eventKey === key.eventKey) ?? null;
      },
      create: async ({ data }: any) => {
        const event = { id: `event-${++sequence}`, status: "RECEIVED", error: null, processedAt: null, receivedAt: new Date(), ...data };
        webhookEvents.push(event);
        return event;
      },
      update: async ({ where, data }: any) => {
        const event = webhookEvents.find(item => item.id === where.id);
        if (!event) throw new Error("WebhookEvent ausente no double");
        Object.assign(event, data);
        return event;
      },
    },
    integrationLog: {
      create: async ({ data }: any) => {
        const log = { id: `log-${++sequence}`, createdAt: new Date(), ...data };
        logs.push(log);
        return log;
      },
    },
    course: { findMany: async ({ where }: any = {}) => where?.id?.in ? courses.filter(course => where.id.in.includes(course.id)) : courses },
    favorite: { count: async () => 0, findMany: async () => [] },
    lessonProgress: { findMany: async () => [] },
  };
  prisma.$transaction = async (callback: (tx: typeof prisma) => unknown) => callback(prisma);

  const service = new TheMembersService(prisma, config({
    THEMEMBERS_ENABLED: true,
    THEMEMBERS_ACCESS_AUTOMATION: true,
    THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN: "checkout-secret",
    THEMEMBERS_SEND_INVITES: false,
  }) as any, { sendInvite: async () => ({}) } as any);

  return {
    service,
    webhook: new TheMembersWebhookController(service),
    experience: new ExperienceService(prisma),
    state: { products, users, customers, subscriptions, grants, enrollments, webhookEvents, logs, watchSessions },
    addWatchSession(userId: string, lessonId: string) {
      watchSessions.push({ id: `watch-${++sequence}`, userId, lessonId, status: "ACTIVE", endedAt: null, blockReason: null });
    },
  };
}

test("compra oficial percorre webhook, cliente, produto, grants, matrículas e biblioteca do aluno", async () => {
  const { webhook, experience, state } = statefulHarness();
  const payload = officialAccessPayload({
    event: "release.access",
    orderId: "order-a",
    productId: "checkout-product-id-a",
    referenceId: "checkout-reference-a",
  });

  const result = await webhook.checkout({ rawBody: payload } as any, "checkout-secret");
  const user = state.users[0];
  const library = await experience.library(user.id);

  assert.equal(result.status, "PROCESSED");
  assert.equal("action" in result ? result.action : undefined, "granted");
  assert.deepEqual(user, {
    id: user.id,
    name: "Aluno Ponta a Ponta",
    email: "aluno.e2e@example.com",
    role: "STUDENT",
    status: "ACTIVE",
  });
  assert.equal(state.customers[0].externalId, "customer-1");
  assert.equal(state.customers[0].userId, user.id);
  assert.equal(state.subscriptions[0].externalSubscriptionId, "order-a");
  assert.equal(state.subscriptions[0].status, "ACTIVE");
  assert.equal(state.grants.filter(item => item.status === "ACTIVE").length, 2);
  assert.deepEqual(state.enrollments.map(item => [item.courseId, item.status, item.source]).sort(), [
    ["course-exclusive", "ACTIVE", "THEMEMBERS"],
    ["course-shared", "ACTIVE", "THEMEMBERS"],
  ]);
  assert.deepEqual(library.courses.map(course => course.id).sort(), ["course-exclusive", "course-shared"]);
  assert.equal(state.webhookEvents[0].eventKey, "CHECKOUT:release.access:order-a");
  assert.equal(state.webhookEvents[0].status, "PROCESSED");
});

test("cancelamento preserva curso mantido por outro produto e bloqueia somente a sessão sem acesso", async () => {
  const { service, experience, state, addWatchSession } = statefulHarness();
  await service.receiveWebhook(officialAccessPayload({ event: "release.access", orderId: "order-a", productId: "checkout-product-id-a", referenceId: "checkout-reference-a" }));
  await service.receiveWebhook(officialAccessPayload({ event: "release.access", orderId: "order-b", productId: "checkout-product-id-b", referenceId: "checkout-reference-b" }));
  const user = state.users[0];
  addWatchSession(user.id, "lesson-exclusive");
  addWatchSession(user.id, "lesson-shared");

  const result = await service.receiveWebhook(officialAccessPayload({ event: "revoke.access", orderId: "order-a", productId: "checkout-product-id-a", referenceId: "checkout-reference-a" }));
  const library = await experience.library(user.id);
  const exclusiveEnrollment = state.enrollments.find(item => item.courseId === "course-exclusive");
  const sharedEnrollment = state.enrollments.find(item => item.courseId === "course-shared");
  const exclusiveSession = state.watchSessions.find(item => item.lessonId === "lesson-exclusive");
  const sharedSession = state.watchSessions.find(item => item.lessonId === "lesson-shared");

  assert.equal("action" in result ? result.action : undefined, "revoked");
  assert.ok(state.grants.filter(item => item.externalProductId === "product-a").every(item => item.status === "CANCELLED"));
  assert.equal(state.grants.find(item => item.externalProductId === "product-b")?.status, "ACTIVE");
  assert.equal(exclusiveEnrollment.status, "CANCELLED");
  assert.equal(sharedEnrollment.status, "ACTIVE");
  assert.deepEqual(library.courses.map(course => course.id), ["course-shared"]);
  assert.equal(exclusiveSession.status, "BLOCKED");
  assert.equal(exclusiveSession.blockReason, "themembers_access_revoked");
  assert.equal(sharedSession.status, "ACTIVE");
  assert.equal(state.subscriptions.find(item => item.externalProductId === "product-a")?.status, "CANCELLED");
  assert.equal(state.subscriptions.find(item => item.externalProductId === "product-b")?.status, "ACTIVE");
});

test("matrícula manual válida permanece soberana após revoke.access", async () => {
  const { service, state, addWatchSession } = statefulHarness();
  await service.receiveWebhook(officialAccessPayload({ event: "release.access", orderId: "order-a", productId: "checkout-product-id-a", referenceId: "checkout-reference-a" }));
  const user = state.users[0];
  const enrollment = state.enrollments.find(item => item.courseId === "course-exclusive");
  Object.assign(enrollment, { source: "admin-manual", status: "ACTIVE", expiresAt: null });
  addWatchSession(user.id, "lesson-exclusive");

  await service.receiveWebhook(officialAccessPayload({ event: "revoke.access", orderId: "order-a", productId: "checkout-product-id-a", referenceId: "checkout-reference-a" }));

  assert.equal(enrollment.status, "ACTIVE");
  assert.equal(enrollment.source, "admin-manual");
  assert.equal(state.watchSessions[0].status, "ACTIVE");
});

test("reentrega do payload oficial não duplica cliente, assinatura, grant ou matrícula", async () => {
  const { service, state } = statefulHarness();
  const payload = officialAccessPayload({ event: "release.access", orderId: "order-a", productId: "checkout-product-id-a", referenceId: "checkout-reference-a" });

  const first = await service.receiveWebhook(payload);
  const duplicate = await service.receiveWebhook(payload);

  assert.equal(first.status, "PROCESSED");
  assert.equal(duplicate.duplicate, true);
  assert.equal(state.users.length, 1);
  assert.equal(state.customers.length, 1);
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.grants.length, 2);
  assert.equal(state.enrollments.length, 2);
  assert.equal(state.webhookEvents.length, 1);
});
