import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { AdminService } from "../src/admin/admin.service";
import { PlaybackSessionService } from "../src/video/playback-session.service";
import { config, recorded, rejectsWith, student } from "./helpers";

test("despublicar curso encerra todas as reproduções ativas do curso", async () => {
  const courseUpdate = recorded(async ({ data }: any) => ({
    id: "course-1",
    status: data.status,
    heroImageUrl: null,
    cardImageUrl: null,
    ...data,
  }));
  const sessionUpdateMany = recorded(async () => ({ count: 2 }));
  const service = new AdminService({
    course: {
      findUnique: async () => ({ id: "course-1", status: "PUBLISHED", heroImageUrl: null, cardImageUrl: null }),
      update: courseUpdate,
    },
    lesson: { findMany: async () => [{ id: "lesson-1" }, { id: "lesson-2" }] },
    watchSession: { updateMany: sessionUpdateMany },
  } as any, {} as any);

  await service.updateCourse("course-1", { status: "DRAFT" as any });

  assert.equal(courseUpdate.calls[0][0].data.publishedAt, null);
  assert.deepEqual(sessionUpdateMany.calls[0][0].where, {
    status: "ACTIVE",
    lessonId: { in: ["lesson-1", "lesson-2"] },
  });
  assert.equal(sessionUpdateMany.calls[0][0].data.status, "BLOCKED");
  assert.equal(sessionUpdateMany.calls[0][0].data.blockReason, "course_unpublished");
  assert.ok(sessionUpdateMany.calls[0][0].data.endedAt instanceof Date);
});

test("despublicar aula encerra somente as reproduções ativas dessa aula", async () => {
  const lessonUpdate = recorded(async ({ data }: any) => ({ id: "lesson-1", moduleId: "module-1", ...data }));
  const sessionUpdateMany = recorded(async () => ({ count: 1 }));
  const service = new AdminService({
    lesson: {
      findUnique: async () => ({ id: "lesson-1", moduleId: "module-1", published: true }),
      update: lessonUpdate,
    },
    watchSession: { updateMany: sessionUpdateMany },
  } as any, {} as any);

  await service.updateLesson("lesson-1", { published: false });

  assert.deepEqual(sessionUpdateMany.calls[0][0].where, { lessonId: "lesson-1", status: "ACTIVE" });
  assert.equal(sessionUpdateMany.calls[0][0].data.status, "BLOCKED");
  assert.equal(sessionUpdateMany.calls[0][0].data.blockReason, "lesson_unpublished");
});

function heartbeatHarness(input: {
  lessonPublished?: boolean;
  courseStatus?: "PUBLISHED" | "DRAFT" | "ARCHIVED";
  preview?: boolean;
  enrollment?: any;
  lastPositionSec?: number;
  durationSec?: number;
}) {
  const now = Date.now();
  const session = {
    id: "session-1",
    userId: student.sub,
    lessonId: "lesson-1",
    deviceId: "device-1",
    status: "ACTIVE",
    blockReason: null,
    lastPositionSec: input.lastPositionSec ?? 10,
    maxCreditedPositionSec: 0,
    watchedSec: 0,
    lastSeenAt: new Date(now - 20_000),
    device: { revokedAt: null },
    lesson: {
      published: input.lessonPublished ?? true,
      preview: input.preview ?? false,
      durationSec: input.durationSec ?? 600,
      videoResource: null,
      module: { course: { id: "course-1", status: input.courseStatus ?? "PUBLISHED" } },
    },
  };
  const sessionUpdateMany = recorded(async () => ({ count: 1 }));
  const sessionUpdate = recorded(async ({ data }: any) => ({ ...session, ...data }));
  const deviceUpdate = recorded(async () => ({}));
  const lock = recorded(async () => 1);
  const tx = {
    $executeRaw: lock,
    watchSession: {
      findFirst: async () => session,
      updateMany: sessionUpdateMany,
      update: sessionUpdate,
    },
    enrollment: { findUnique: async () => input.enrollment ?? null },
    device: { update: deviceUpdate },
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
  const service = new PlaybackSessionService(prisma as any, config({
    WATCH_SESSION_HEARTBEAT_SEC: 20,
    WATCH_SESSION_STALE_SEC: 75,
  }) as any);
  return { service, sessionUpdateMany, sessionUpdate, deviceUpdate, lock };
}

test("heartbeat bloqueia sessão quando o curso foi despublicado", async () => {
  const { service, sessionUpdateMany, sessionUpdate } = heartbeatHarness({ courseStatus: "DRAFT" });

  await rejectsWith(service.heartbeat(student, "session-1", 30), ForbiddenException, /perdeu a autorização/i);

  assert.equal(sessionUpdate.calls.length, 0);
  assert.equal(sessionUpdateMany.calls[0][0].data.status, "BLOCKED");
  assert.equal(sessionUpdateMany.calls[0][0].data.blockReason, "course_unpublished");
});

test("heartbeat bloqueia sessão quando a aula foi despublicada", async () => {
  const { service, sessionUpdateMany, sessionUpdate } = heartbeatHarness({ lessonPublished: false });

  await rejectsWith(service.heartbeat(student, "session-1", 30), ForbiddenException, /perdeu a autorização/i);

  assert.equal(sessionUpdate.calls.length, 0);
  assert.equal(sessionUpdateMany.calls[0][0].data.blockReason, "lesson_unpublished");
});

test("heartbeat bloqueia sessão quando a matrícula expirou", async () => {
  const { service, sessionUpdateMany, sessionUpdate } = heartbeatHarness({
    enrollment: {
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() - 1_000),
    },
  });

  await rejectsWith(service.heartbeat(student, "session-1", 30), ForbiddenException, /perdeu a autorização/i);

  assert.equal(sessionUpdate.calls.length, 0);
  assert.equal(sessionUpdateMany.calls[0][0].data.blockReason, "course_access_inactive");
});

test("heartbeat continua ativo e credita avanço normal com aula, curso e matrícula válidos", async () => {
  const { service, sessionUpdateMany, sessionUpdate, deviceUpdate, lock } = heartbeatHarness({
    enrollment: {
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() + 120_000),
    },
  });

  const result = await service.heartbeat(student, "session-1", 30);

  assert.deepEqual(result, { active: true, nextHeartbeatSec: 20 });
  assert.equal(sessionUpdateMany.calls.length, 0);
  assert.equal(sessionUpdate.calls.length, 1);
  assert.equal(sessionUpdate.calls[0][0].data.watchedSec.increment, 20);
  assert.equal(sessionUpdate.calls[0][0].data.lastPositionSec, 30);
  assert.equal(sessionUpdate.calls[0][0].data.maxCreditedPositionSec, 30);
  assert.equal(deviceUpdate.calls.length, 1);
  assert.equal(lock.calls.length, 1);
});

test("heartbeat de vídeo pausado não aumenta watchedSec", async () => {
  const { service, sessionUpdate } = heartbeatHarness({
    lastPositionSec: 30,
    enrollment: { status: "ACTIVE", startsAt: new Date(Date.now() - 60_000), expiresAt: null },
  });

  await service.heartbeat(student, "session-1", 30);

  assert.equal(sessionUpdate.calls[0][0].data.watchedSec, undefined);
  assert.equal(sessionUpdate.calls[0][0].data.maxCreditedPositionSec, undefined);
  assert.equal(sessionUpdate.calls[0][0].data.lastPositionSec, 30);
});

test("salto para frente atualiza a posição sem creditar tempo assistido", async () => {
  const { service, sessionUpdate } = heartbeatHarness({
    lastPositionSec: 30,
    enrollment: { status: "ACTIVE", startsAt: new Date(Date.now() - 60_000), expiresAt: null },
  });

  await service.heartbeat(student, "session-1", 300);

  assert.equal(sessionUpdate.calls[0][0].data.watchedSec, undefined);
  assert.equal(sessionUpdate.calls[0][0].data.maxCreditedPositionSec, undefined);
  assert.equal(sessionUpdate.calls[0][0].data.lastPositionSec, 300);
});

test("reprodução em 2x recebe somente o tempo real transcorrido", async () => {
  const { service, sessionUpdate } = heartbeatHarness({
    lastPositionSec: 30,
    enrollment: { status: "ACTIVE", startsAt: new Date(Date.now() - 60_000), expiresAt: null },
  });

  await service.heartbeat(student, "session-1", 70);

  assert.equal(sessionUpdate.calls[0][0].data.watchedSec.increment, 20);
  assert.equal(sessionUpdate.calls[0][0].data.maxCreditedPositionSec, 70);
  assert.equal(sessionUpdate.calls[0][0].data.lastPositionSec, 70);
});

test("retrocesso não gera crédito e permite retomar a contagem na posição nova", async () => {
  const { service, sessionUpdate } = heartbeatHarness({
    lastPositionSec: 100,
    enrollment: { status: "ACTIVE", startsAt: new Date(Date.now() - 60_000), expiresAt: null },
  });

  await service.heartbeat(student, "session-1", 80);

  assert.equal(sessionUpdate.calls[0][0].data.watchedSec, undefined);
  assert.equal(sessionUpdate.calls[0][0].data.maxCreditedPositionSec, undefined);
  assert.equal(sessionUpdate.calls[0][0].data.lastPositionSec, 80);
});

test("posição do heartbeat é limitada à duração conhecida da aula", async () => {
  const { service, sessionUpdate } = heartbeatHarness({
    lastPositionSec: 90,
    durationSec: 100,
    enrollment: { status: "ACTIVE", startsAt: new Date(Date.now() - 60_000), expiresAt: null },
  });

  await service.heartbeat(student, "session-1", 999);

  assert.equal(sessionUpdate.calls[0][0].data.lastPositionSec, 100);
  assert.equal(sessionUpdate.calls[0][0].data.watchedSec.increment, 10);
  assert.equal(sessionUpdate.calls[0][0].data.maxCreditedPositionSec, 100);
});
