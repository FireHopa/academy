import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AdminService } from "../src/admin/admin.service";
import { ExperienceService } from "../src/experience/experience.service";
import { recorded, rejectsWith } from "./helpers";

function publishedLesson(preview = false) {
  return {
    id: "lesson-1",
    title: "Aula protegida",
    description: "Conteúdo",
    published: true,
    preview,
    module: {
      courseId: "course-1",
      course: { id: "course-1", status: "PUBLISHED" },
    },
  };
}

function resourcePrisma(enrollment: any, lesson = publishedLesson()) {
  return {
    lesson: { findUnique: async () => lesson },
    enrollment: { findUnique: async () => enrollment },
    lessonChapter: { findMany: async () => [] },
    lessonMaterial: { findMany: async () => [] },
    lessonTranscript: { findUnique: async () => null },
    lessonProgress: { findUnique: async () => null },
  };
}

test("matrícula positiva cria acesso manual ativo com período válido", async () => {
  const upsert = recorded(async (args: any) => ({ id: "enrollment-1", ...args.create }));
  const prisma = {
    user: { findUnique: async () => ({ id: "user-1", role: "STUDENT" }) },
    course: { findUnique: async () => ({ id: "course-1" }) },
    enrollment: { upsert },
  };
  const service = new AdminService(prisma as any, {} as any);

  const result = await service.grantEnrollment("user-1", {
    courseId: "course-1",
    startsAt: "2026-08-18T10:00:00.000Z",
    expiresAt: "2026-09-18T10:00:00.000Z",
  });

  assert.equal(result.status, "ACTIVE");
  assert.equal(result.source, "admin-manual");
  assert.equal(upsert.calls[0][0].where.userId_courseId.userId, "user-1");
});

test("matrícula negativa rejeita expiração anterior ou igual ao início", async () => {
  const upsert = recorded(async () => ({}));
  const service = new AdminService({
    user: { findUnique: async () => ({ id: "user-1", role: "STUDENT" }) },
    course: { findUnique: async () => ({ id: "course-1" }) },
    enrollment: { upsert },
  } as any, {} as any);

  await rejectsWith(service.grantEnrollment("user-1", {
    courseId: "course-1",
    startsAt: "2026-08-18T10:00:00.000Z",
    expiresAt: "2026-08-18T09:59:59.000Z",
  }), BadRequestException, /posterior/i);
  assert.equal(upsert.calls.length, 0);
});

test("matrícula ativa libera os recursos da aula", async () => {
  const service = new ExperienceService(resourcePrisma({
    status: "ACTIVE",
    startsAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 60_000),
  }) as any);

  const result = await service.lessonResources("user-1", "STUDENT", "lesson-1");

  assert.equal(result.lesson.id, "lesson-1");
  assert.deepEqual(result.materials, []);
});

test("matrícula expirada bloqueia os recursos mesmo que continue marcada ACTIVE", async () => {
  const service = new ExperienceService(resourcePrisma({
    status: "ACTIVE",
    startsAt: new Date(Date.now() - 120_000),
    expiresAt: new Date(Date.now() - 1_000),
  }) as any);

  await rejectsWith(service.lessonResources("user-1", "STUDENT", "lesson-1"), ForbiddenException, /não possui acesso/i);
});

test("preview positivo permite acesso sem matrícula", async () => {
  const enrollmentLookup = recorded(async () => null);
  const prisma = resourcePrisma(null, publishedLesson(true));
  prisma.enrollment.findUnique = enrollmentLookup;
  const service = new ExperienceService(prisma as any);

  const result = await service.lessonResources("user-1", "STUDENT", "lesson-1");

  assert.equal(result.lesson.id, "lesson-1");
  assert.equal(enrollmentLookup.calls.length, 0);
});

test("curso sem acesso bloqueia aula regular sem matrícula", async () => {
  const service = new ExperienceService(resourcePrisma(null) as any);

  await rejectsWith(service.lessonResources("user-1", "STUDENT", "lesson-1"), ForbiddenException, /não possui acesso/i);
});
