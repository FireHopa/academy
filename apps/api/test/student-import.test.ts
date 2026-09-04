import assert from "node:assert/strict";
import { test } from "node:test";
import { AdminService } from "../src/admin/admin.service";
import { recorded } from "./helpers";

test("importa alunos, normaliza e-mails e ignora duplicidades", async () => {
  let sequence = 0;
  const create = recorded(async (args: any) => ({
    id: `user-${++sequence}`,
    name: args.data.name,
    email: args.data.email,
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  }));
  const createInvite = recorded(async (userId: string) => ({
    url: `https://academy.example/invite/${userId}`,
  }));
  const prisma = {
    user: {
      findUnique: async ({ where }: any) => where.email === "existente@example.com" ? { id: "existing" } : null,
      create,
    },
  };
  const service = new AdminService(prisma as any, { createInvite } as any);

  const result = await service.importStudents({
    sendInviteEmail: false,
    rows: [
      { name: "  Ana Silva  ", email: "ANA@EXAMPLE.COM" },
      { name: "Ana repetida", email: "ana@example.com" },
      { name: "Aluno existente", email: "existente@example.com" },
    ],
  });

  assert.deepEqual(
    { total: result.total, created: result.created, skipped: result.skipped, failed: result.failed },
    { total: 3, created: 1, skipped: 2, failed: 0 },
  );
  assert.equal(create.calls.length, 1);
  assert.equal(create.calls[0][0].data.name, "Ana Silva");
  assert.equal(create.calls[0][0].data.email, "ana@example.com");
  assert.equal(createInvite.calls.length, 1);
  assert.equal(result.results[0].inviteUrl, "https://academy.example/invite/user-1");
  assert.equal(result.results[1].message, "E-mail repetido no arquivo");
  assert.match(result.results[2].message ?? "", /já existe/i);
});

test("cria aluno com dados administrativos e matrícula na mesma operação", async () => {
  const createdAt = new Date("2026-08-21T10:00:00.000Z");
  const create = recorded(async (args: any) => ({
    id: "user-new",
    name: args.data.name,
    email: args.data.email,
    cpf: args.data.cpf,
    phone: args.data.phone,
    status: "ACTIVE",
    createdAt,
    enrollments: [{
      id: "enrollment-new",
      status: "ACTIVE",
      startsAt: args.data.enrollments.create.startsAt,
      expiresAt: args.data.enrollments.create.expiresAt,
      course: { id: "course-1", title: "Curso Premium", slug: "curso-premium", status: "PUBLISHED" },
    }],
  }));
  const prisma = {
    user: { findUnique: async () => null, create },
    course: { findUnique: async ({ where }: any) => where.id === "course-1" ? { id: "course-1" } : null },
  };
  const service = new AdminService(prisma as any, {} as any);

  const result = await service.createStudent({
    name: "  Felipe Souza  ",
    email: "FELIPE@EXAMPLE.COM",
    password: "senha-segura-2026",
    cpf: "52998224725",
    phone: "11999998888",
    courseId: "course-1",
    startsAt: "2026-08-21T00:00:00.000Z",
    expiresAt: "2027-08-21T23:59:59.000Z",
  });

  assert.equal(create.calls.length, 1);
  const data = create.calls[0][0].data;
  assert.equal(data.name, "Felipe Souza");
  assert.equal(data.email, "felipe@example.com");
  assert.equal(data.cpf, "52998224725");
  assert.equal(data.phone, "11999998888");
  assert.equal(data.enrollments.create.courseId, "course-1");
  assert.equal(data.enrollments.create.source, "admin-manual");
  assert.match(data.passwordHash, /^\$2/);
  assert.equal(result.enrollment?.course.title, "Curso Premium");
  assert.equal(result.invite, null);
});

test("cria aluno e informa falha parcial quando o convite não é entregue", async () => {
  const create = recorded(async (args: any) => ({
    id: "user-partial",
    name: args.data.name,
    email: args.data.email,
    cpf: null,
    phone: null,
    status: "ACTIVE",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    enrollments: [],
  }));
  const sendInvite = recorded(async () => ({
    url: "https://academy.example/invite/token-partial",
    delivered: false,
  }));
  const prisma = { user: { findUnique: async () => null, create } };
  const service = new AdminService(prisma as any, { sendInvite } as any);

  const result = await service.createStudent({
    name: "Aluno Parcial",
    email: "parcial@example.com",
    sendInviteEmail: true,
  });

  assert.equal(create.calls.length, 1);
  assert.equal(sendInvite.calls.length, 1);
  assert.equal(result.user.id, "user-partial");
  assert.equal(result.invite?.delivered, false);
  assert.equal(result.invite?.deliveryStatus, "FAILED");
  assert.equal(result.invite?.url, "https://academy.example/invite/token-partial");
});

test("importação conta aluno como criado mesmo quando o convite não é entregue", async () => {
  const create = recorded(async (args: any) => ({
    id: "user-imported",
    name: args.data.name,
    email: args.data.email,
    cpf: null,
    phone: null,
    status: "ACTIVE",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    enrollments: [],
  }));
  const prisma = { user: { findUnique: async () => null, create } };
  const service = new AdminService(prisma as any, {
    sendInvite: async () => ({ url: "https://academy.example/invite/imported", delivered: false }),
  } as any);

  const result = await service.importStudents({
    sendInviteEmail: true,
    rows: [{ name: "Aluno Importado", email: "importado@example.com" }],
  });

  assert.deepEqual(
    { created: result.created, skipped: result.skipped, failed: result.failed },
    { created: 1, skipped: 0, failed: 0 },
  );
  assert.equal(result.results[0].status, "CREATED");
  assert.equal(result.results[0].inviteDeliveryStatus, "FAILED");
  assert.match(result.results[0].message ?? "", /não foi enviado/i);
  assert.equal(result.results[0].inviteUrl, "https://academy.example/invite/imported");
});

test("reenvio gera convite para o aluno existente sem duplicar usuário ou matrícula", async () => {
  const createUser = recorded(async () => { throw new Error("não deveria criar usuário"); });
  const createEnrollment = recorded(async () => { throw new Error("não deveria criar matrícula"); });
  const sendInvite = recorded(async () => ({
    url: "https://academy.example/invite/retry",
    delivered: true,
  }));
  const prisma = {
    user: { findUnique: async () => ({ id: "user-existing", role: "STUDENT" }), create: createUser },
    enrollment: { create: createEnrollment },
  };
  const service = new AdminService(prisma as any, { sendInvite } as any);

  const result = await service.generateStudentInvite("user-existing", true);

  assert.equal(result.deliveryStatus, "SENT");
  assert.equal(result.delivered, true);
  assert.equal(sendInvite.calls.length, 1);
  assert.deepEqual(sendInvite.calls[0], ["user-existing"]);
  assert.equal(createUser.calls.length, 0);
  assert.equal(createEnrollment.calls.length, 0);
});
