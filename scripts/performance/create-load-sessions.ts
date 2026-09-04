import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { sign } from "jsonwebtoken";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../apps/api/src/generated/prisma/client";

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada");
  if (!jwtSecret) throw new Error("JWT_SECRET não configurado");

  const requiredStudents = positiveInteger(process.env.LOAD_STUDENT_VUS, 100);
  const output = resolve(process.cwd(), process.env.LOAD_SESSIONS_FILE?.trim() || "load-tests/.sessions.local.json");
  const pool = new Pool({ connectionString: databaseUrl, max: 3, application_name: "academy-load-session-generator" });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const now = new Date();

  try {
    const users = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        status: "ACTIVE",
        onboardingCompletedAt: { not: null },
        enrollments: {
          some: {
            status: "ACTIVE",
            startsAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            course: { status: "PUBLISHED", modules: { some: { lessons: { some: { published: true, videoStatus: "READY" } } } } },
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        sessionVersion: true,
        onboardingCompletedAt: true,
        enrollments: {
          where: { status: "ACTIVE", startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          select: { courseId: true, course: { select: { slug: true } } },
        },
      },
      take: requiredStudents,
      orderBy: { createdAt: "asc" },
    });
    if (users.length < requiredStudents) {
      throw new Error(`São necessários ${requiredStudents} alunos ativos, onboarded e com vídeo liberado. Encontrados: ${users.length}.`);
    }

    const courseIds = [...new Set(users.flatMap(user => user.enrollments.map(item => item.courseId)))];
    const lessons = await prisma.lesson.findMany({
      where: { published: true, videoStatus: "READY", module: { courseId: { in: courseIds }, course: { status: "PUBLISHED" } } },
      select: { id: true, module: { select: { courseId: true } } },
      orderBy: [{ module: { courseId: "asc" } }, { position: "asc" }],
    });
    const lessonByCourse = new Map<string, string>();
    lessons.forEach(lesson => { if (!lessonByCourse.has(lesson.module.courseId)) lessonByCourse.set(lesson.module.courseId, lesson.id); });

    const students = users.map(user => {
      const enrollment = user.enrollments.find(item => lessonByCourse.has(item.courseId));
      if (!enrollment) throw new Error(`Nenhuma aula READY encontrada para ${user.email}`);
      const token = sign({
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        ver: user.sessionVersion,
        onboardingCompleted: Boolean(user.onboardingCompletedAt),
      }, jwtSecret, { expiresIn: "2h" });
      return {
        userId: user.id,
        cookie: `academy_session=${token}`,
        lessonId: lessonByCourse.get(enrollment.courseId)!,
        courseSlug: enrollment.course.slug,
      };
    });

    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true, email: true, name: true, role: true, sessionVersion: true, onboardingCompletedAt: true },
      orderBy: { createdAt: "asc" },
    });
    const adminSession = admin ? {
      userId: admin.id,
      cookie: `academy_session=${sign({
        sub: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        ver: admin.sessionVersion,
        onboardingCompleted: Boolean(admin.onboardingCompletedAt),
      }, jwtSecret, { expiresIn: "2h" })}`,
    } : null;

    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), expiresIn: "2h", students, admin: adminSession }, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`Arquivo de sessões criado com ${students.length} alunos${adminSession ? " e 1 admin" : ""}: ${output}\n`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
