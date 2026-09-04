import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ForbiddenException } from "@nestjs/common";
import { ProgressService } from "../src/progress/progress.service";
import { recorded, rejectsWith } from "./helpers";

function lesson(certificateEnabled = false) {
  return {
    id: "lesson-1",
    title: "Aula 1",
    type: "VIDEO",
    durationSec: 100,
    published: true,
    preview: false,
    module: {
      courseId: "course-1",
      course: { id: "course-1", status: "PUBLISHED", certificateEnabled },
    },
  };
}

const activeEnrollment = () => ({
  id: "enrollment-1",
  status: "ACTIVE",
  startsAt: new Date(Date.now() - 60_000),
  expiresAt: new Date(Date.now() + 60_000),
});

test("progresso positivo persiste posição normalizada para aluno matriculado", async () => {
  const create = recorded(async (args: any) => ({ id: "progress-1", ...args.data }));
  const service = new ProgressService({
    lesson: { findUnique: async () => lesson() },
    enrollment: { findUnique: async () => activeEnrollment() },
    lessonProgress: { findUnique: async () => null, create },
  } as any);

  const result = await service.upsert("user-1", "STUDENT", "lesson-1", 135, false);

  assert.equal(result.progress.positionSec, 100);
  assert.equal(result.progress.completed, false);
  assert.equal(create.calls[0][0].data.positionSec, 100);
});

test("progresso negativo rejeita aluno sem matrícula ativa", async () => {
  const create = recorded(async () => ({}));
  const service = new ProgressService({
    lesson: { findUnique: async () => lesson() },
    enrollment: { findUnique: async () => null },
    lessonProgress: { create },
  } as any);

  await rejectsWith(service.upsert("user-1", "STUDENT", "lesson-1", 30, false), ForbiddenException, /não possui acesso/i);
  assert.equal(create.calls.length, 0);
});

test("conclusão positiva exige posição de 92% e tempo real acumulado de 45%", async () => {
  const create = recorded(async (args: any) => ({ id: "progress-1", ...args.data }));
  const service = new ProgressService({
    lesson: { findUnique: async () => lesson() },
    enrollment: { findUnique: async () => activeEnrollment() },
    watchSession: { aggregate: async () => ({ _sum: { watchedSec: 45 }, _max: { maxCreditedPositionSec: 92 } }) },
    lessonProgress: { findUnique: async () => null, create },
  } as any);

  const result = await service.upsert("user-1", "STUDENT", "lesson-1", 92, true);

  assert.equal(result.progress.completed, true);
  assert.ok(result.progress.completedAt instanceof Date);
});

test("conclusão negativa ignora sinal do cliente quando o tempo assistido é insuficiente", async () => {
  const create = recorded(async (args: any) => ({ id: "progress-1", ...args.data }));
  const service = new ProgressService({
    lesson: { findUnique: async () => lesson() },
    enrollment: { findUnique: async () => activeEnrollment() },
    watchSession: { aggregate: async () => ({ _sum: { watchedSec: 44 }, _max: { maxCreditedPositionSec: 100 } }) },
    lessonProgress: { findUnique: async () => null, create },
  } as any);

  const result = await service.upsert("user-1", "STUDENT", "lesson-1", 100, true);

  assert.equal(result.progress.completed, false);
  assert.equal(result.progress.completedAt, null);
});

test("conclusão rejeita posição enviada apenas ao progresso sem confirmação do heartbeat", async () => {
  const create = recorded(async (args: any) => ({ id: "progress-1", ...args.data }));
  const service = new ProgressService({
    lesson: { findUnique: async () => lesson() },
    enrollment: { findUnique: async () => activeEnrollment() },
    watchSession: { aggregate: async () => ({ _sum: { watchedSec: 50 }, _max: { maxCreditedPositionSec: 91 } }) },
    lessonProgress: { findUnique: async () => null, create },
  } as any);

  const result = await service.upsert("user-1", "STUDENT", "lesson-1", 100, true);

  assert.equal(result.progress.completed, false);
  assert.equal(result.progress.completedAt, null);
});

test("certificado positivo é emitido quando todas as aulas publicadas estão concluídas", async () => {
  const certificateUpsert = recorded(async (args: any) => ({ id: "certificate-1", ...args.create }));
  const service = new ProgressService({
    lesson: {
      findUnique: async () => lesson(true),
      findMany: async () => [{ id: "lesson-1" }, { id: "lesson-2" }],
    },
    enrollment: { findUnique: async () => activeEnrollment() },
    watchSession: { aggregate: async () => ({ _sum: { watchedSec: 50 }, _max: { maxCreditedPositionSec: 100 } }) },
    lessonProgress: {
      findUnique: async () => null,
      create: async (args: any) => ({ id: "progress-1", ...args.data }),
      count: async () => 2,
    },
    certificate: { upsert: certificateUpsert },
  } as any);

  const result = await service.upsert("user-1", "STUDENT", "lesson-1", 100, true);

  assert.equal(result.certificate?.id, "certificate-1");
  assert.match(result.certificate!.code, /^CERT-\d{4}-[A-F0-9]{16}$/);
  assert.equal(certificateUpsert.calls.length, 1);
});

test("certificado negativo não é emitido enquanto existir aula publicada pendente", async () => {
  const certificateUpsert = recorded(async () => ({}));
  const service = new ProgressService({
    lesson: {
      findUnique: async () => lesson(true),
      findMany: async () => [{ id: "lesson-1" }, { id: "lesson-2" }],
    },
    enrollment: { findUnique: async () => activeEnrollment() },
    watchSession: { aggregate: async () => ({ _sum: { watchedSec: 50 }, _max: { maxCreditedPositionSec: 100 } }) },
    lessonProgress: {
      findUnique: async () => null,
      create: async (args: any) => ({ id: "progress-1", ...args.data }),
      count: async () => 1,
    },
    certificate: { upsert: certificateUpsert },
  } as any);

  const result = await service.upsert("user-1", "STUDENT", "lesson-1", 100, true);

  assert.equal(result.certificate, null);
  assert.equal(certificateUpsert.calls.length, 0);
});

test("migration adiciona a posição creditada sem alterar sessões existentes", () => {
  const root = process.cwd();
  const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(resolve(root, "prisma/migrations/20260902170000_watch_progress_verification/migration.sql"), "utf8");

  assert.match(schema, /maxCreditedPositionSec\s+Int\s+@default\(0\)/);
  assert.match(migration, /ADD COLUMN "maxCreditedPositionSec" INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(migration, /DELETE|DROP TABLE|TRUNCATE/i);
});
