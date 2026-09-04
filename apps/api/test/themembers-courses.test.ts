import assert from "node:assert/strict";
import { test } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { TheMembersService } from "../src/integrations/themembers.service";
import { config, rejectsWith } from "./helpers";

test("consulta cursos, módulos e aulas da API v1 da TheMembers com paginação", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; authorization: string | null }> = [];

  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input.toString() : String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, authorization: headers.get("Authorization") });

    if (url.endsWith("?page=2")) {
      return Response.json({
        data: [{ id: 22, title: "Curso avançado", published: false, modules: [] }],
        links: { next: null },
      });
    }

    return Response.json({
      data: [{
        id: 11,
        title: "Curso inicial",
        description: "Descrição do curso",
        published: 1,
        blocked: 0,
        modules: [{
          id: 111,
          title: "Boas-vindas",
          published: "true",
          lessons: [{ id: 1111, title: "Primeira aula", subtitle: "Comece aqui", published: true }],
        }],
      }],
      links: { next: "https://api.themembers.com.br/api/v1/courses?page=2" },
    });
  }) as typeof fetch;

  try {
    const service = new TheMembersService({
      course: {
        findMany: async () => [{ id: "local-11", title: "Curso inicial", slug: "curso-inicial", status: "DRAFT", sourceExternalId: "11", sourceSyncedAt: new Date("2026-08-21T12:00:00.000Z") }],
      },
    } as any, config({
      THEMEMBERS_API_TOKEN: "api-token",
      THEMEMBERS_COURSES_ENDPOINT: "https://api.themembers.com.br/api/v1/courses",
    }) as any, {} as any);

    const result = await service.listRemoteCourses();

    assert.deepEqual(result.totals, { courses: 2, modules: 1, lessons: 1 });
    assert.equal(result.courses[0].id, "11");
    assert.equal(result.courses[0].published, true);
    assert.equal(result.courses[0].blocked, false);
    assert.equal(result.courses[0].modules[0].lessons[0].title, "Primeira aula");
    assert.equal(result.courses[0].localCourse?.id, "local-11");
    assert.equal(result.courses[1].localCourse, null);
    assert.equal(result.courses[1].published, false);
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => request.authorization === "Bearer api-token"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("consulta de cursos exige API Token v1 da TheMembers", async () => {
  const service = new TheMembersService({} as any, config() as any, {} as any);

  await rejectsWith(
    service.listRemoteCourses(),
    ServiceUnavailableException,
    /THEMEMBERS_API_TOKEN não configurado/i,
  );
});

test("importa um curso da TheMembers como rascunho e atualiza sem duplicar", async () => {
  const originalFetch = globalThis.fetch;
  const courses: any[] = [];
  const modules: any[] = [];
  const lessons: any[] = [];

  const prisma: any = {
    course: {
      findUnique: async ({ where }: any) => {
        if (where.slug) return courses.find(course => course.slug === where.slug) ?? null;
        const source = where.sourceProvider_sourceExternalId;
        return courses.find(course => course.sourceProvider === source.sourceProvider && course.sourceExternalId === source.sourceExternalId) ?? null;
      },
      create: async ({ data }: any) => {
        const course = { id: `course-${courses.length + 1}`, ...data };
        courses.push(course);
        return course;
      },
      update: async ({ where, data }: any) => {
        const course = courses.find(item => item.id === where.id);
        Object.assign(course, data);
        return course;
      },
    },
    courseModule: {
      findUnique: async ({ where }: any) => {
        const source = where.sourceProvider_sourceExternalId;
        return modules.find(module => module.sourceProvider === source.sourceProvider && module.sourceExternalId === source.sourceExternalId) ?? null;
      },
      findMany: async ({ where }: any) => modules.filter(module => module.courseId === where.courseId).sort((a, b) => a.position - b.position),
      create: async ({ data }: any) => {
        const module = { id: `module-${modules.length + 1}`, ...data };
        modules.push(module);
        return module;
      },
      update: async ({ where, data }: any) => {
        const module = modules.find(item => item.id === where.id);
        Object.assign(module, data);
        return module;
      },
    },
    lesson: {
      findUnique: async ({ where }: any) => {
        const source = where.sourceProvider_sourceExternalId;
        return lessons.find(lesson => lesson.sourceProvider === source.sourceProvider && lesson.sourceExternalId === source.sourceExternalId) ?? null;
      },
      findMany: async ({ where }: any) => lessons.filter(lesson => lesson.moduleId === where.moduleId).sort((a, b) => a.position - b.position),
      create: async ({ data }: any) => {
        const lesson = { id: `lesson-${lessons.length + 1}`, ...data };
        lessons.push(lesson);
        return lesson;
      },
      update: async ({ where, data }: any) => {
        const lesson = lessons.find(item => item.id === where.id);
        Object.assign(lesson, data);
        return lesson;
      },
    },
    integrationLog: { create: async () => ({}) },
    $executeRaw: async () => 0,
  };
  prisma.$transaction = async (work: (tx: any) => Promise<any>) => work(prisma);

  globalThis.fetch = (async () => Response.json({
    data: [{
      id: 11,
      title: "Curso inicial",
      description: "Descrição do curso",
      published: true,
      modules: [{
        id: 111,
        title: "Boas-vindas",
        published: true,
        lessons: [{ id: 1111, title: "Primeira aula", subtitle: "Comece aqui", published: true }],
      }],
    }],
    links: { next: null },
  })) as typeof fetch;

  try {
    const service = new TheMembersService(prisma, config({
      THEMEMBERS_API_TOKEN: "api-token",
      THEMEMBERS_COURSES_ENDPOINT: "https://api.themembers.com.br/api/v1/courses",
    }) as any, {} as any);

    const first = await service.importRemoteCourse("11");
    const second = await service.importRemoteCourse("11");

    assert.equal(first.courseCreated, true);
    assert.equal(first.localCourse.status, "DRAFT");
    assert.equal(first.modulesCreated, 1);
    assert.equal(first.lessonsCreated, 1);
    assert.equal(second.courseCreated, false);
    assert.equal(second.modulesCreated, 0);
    assert.equal(second.lessonsCreated, 0);
    assert.equal(second.modulesUpdated, 1);
    assert.equal(second.lessonsUpdated, 1);
    assert.equal(courses.length, 1);
    assert.equal(modules.length, 1);
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].published, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sincroniza visibilidade e despublica somente conteúdo removido da TheMembers", async () => {
  const originalFetch = globalThis.fetch;
  const courses: any[] = [];
  const modules: any[] = [];
  const lessons: any[] = [];
  const endedSessions: any[] = [];
  let remoteCourse: any = {
    id: 31,
    title: "Curso sincronizado",
    published: true,
    blocked: false,
    modules: [
      {
        id: 311,
        title: "Módulo mantido",
        published: true,
        blocked: false,
        lessons: [
          { id: 3111, title: "Aula mantida", published: true, blocked: false },
          { id: 3112, title: "Aula removível", published: true, blocked: false },
        ],
      },
      {
        id: 312,
        title: "Módulo removível",
        published: true,
        blocked: false,
        lessons: [{ id: 3121, title: "Aula do módulo removível", published: true, blocked: false }],
      },
    ],
  };

  const prisma: any = {
    course: {
      findUnique: async ({ where }: any) => {
        if (where.slug) return courses.find(course => course.slug === where.slug) ?? null;
        const source = where.sourceProvider_sourceExternalId;
        return courses.find(course => course.sourceProvider === source.sourceProvider && course.sourceExternalId === source.sourceExternalId) ?? null;
      },
      create: async ({ data }: any) => {
        const course = { id: `course-${courses.length + 1}`, ...data };
        courses.push(course);
        return course;
      },
      update: async ({ where, data }: any) => {
        const course = courses.find(item => item.id === where.id);
        Object.assign(course, data);
        return course;
      },
    },
    courseModule: {
      findUnique: async ({ where }: any) => {
        const source = where.sourceProvider_sourceExternalId;
        return modules.find(module => module.sourceProvider === source.sourceProvider && module.sourceExternalId === source.sourceExternalId) ?? null;
      },
      findMany: async ({ where }: any) => modules.filter(module => module.courseId === where.courseId).sort((a, b) => a.position - b.position),
      create: async ({ data }: any) => {
        const module = { id: `module-${modules.length + 1}`, ...data };
        modules.push(module);
        return module;
      },
      update: async ({ where, data }: any) => {
        const module = modules.find(item => item.id === where.id);
        Object.assign(module, data);
        return module;
      },
    },
    lesson: {
      findUnique: async ({ where }: any) => {
        const source = where.sourceProvider_sourceExternalId;
        return lessons.find(lesson => lesson.sourceProvider === source.sourceProvider && lesson.sourceExternalId === source.sourceExternalId) ?? null;
      },
      findMany: async ({ where }: any) => {
        const moduleIds = typeof where.moduleId === "string" ? [where.moduleId] : where.moduleId?.in;
        return lessons
          .filter(lesson => !moduleIds || moduleIds.includes(lesson.moduleId))
          .filter(lesson => !where.sourceProvider || lesson.sourceProvider === where.sourceProvider)
          .filter(lesson => typeof where.published !== "boolean" || lesson.published === where.published)
          .sort((a, b) => a.position - b.position);
      },
      create: async ({ data }: any) => {
        const lesson = { id: `lesson-${lessons.length + 1}`, ...data };
        lessons.push(lesson);
        return lesson;
      },
      update: async ({ where, data }: any) => {
        const lesson = lessons.find(item => item.id === where.id);
        Object.assign(lesson, data);
        return lesson;
      },
      updateMany: async ({ where, data }: any) => {
        const matches = lessons.filter(lesson => {
          if (where.id?.in && !where.id.in.includes(lesson.id)) return false;
          if (where.moduleId?.in && !where.moduleId.in.includes(lesson.moduleId)) return false;
          if (where.sourceProvider && lesson.sourceProvider !== where.sourceProvider) return false;
          if (typeof where.published === "boolean" && lesson.published !== where.published) return false;
          return true;
        });
        matches.forEach(lesson => Object.assign(lesson, data));
        return { count: matches.length };
      },
    },
    watchSession: {
      updateMany: async (args: any) => {
        endedSessions.push(args);
        return { count: 3 };
      },
    },
    integrationLog: { create: async () => ({}) },
    $executeRaw: async () => 0,
  };
  prisma.$transaction = async (work: (tx: any) => Promise<any>) => work(prisma);
  globalThis.fetch = (async () => Response.json({ data: [remoteCourse], links: { next: null } })) as typeof fetch;

  try {
    const service = new TheMembersService(prisma, config({
      THEMEMBERS_API_TOKEN: "api-token",
      THEMEMBERS_COURSES_ENDPOINT: "https://api.themembers.com.br/api/v1/courses",
    }) as any, {} as any);

    await service.importRemoteCourse("31");
    const keptModule = modules.find(module => module.sourceExternalId === "311");
    const manualModule = { id: "manual-module", courseId: courses[0].id, title: "Módulo manual", position: 3, sourceProvider: null };
    modules.push(manualModule);
    lessons.push(
      { id: "manual-inside-imported", moduleId: keptModule.id, title: "Aula manual no módulo importado", position: 2, published: true, sourceProvider: null },
      { id: "manual-inside-manual", moduleId: manualModule.id, title: "Aula manual", position: 1, published: true, sourceProvider: null },
    );

    remoteCourse = {
      ...remoteCourse,
      modules: [{
        ...remoteCourse.modules[0],
        lessons: [{ ...remoteCourse.modules[0].lessons[0], blocked: true }],
      }],
    };
    const removalSync = await service.importRemoteCourse("31");

    assert.equal(lessons.find(lesson => lesson.sourceExternalId === "3111").published, false, "aula bloqueada deve ser despublicada");
    assert.equal(lessons.find(lesson => lesson.sourceExternalId === "3112").published, false, "aula removida deve ser despublicada");
    assert.equal(lessons.find(lesson => lesson.sourceExternalId === "3121").published, false, "aula de módulo removido deve ser despublicada");
    assert.equal(lessons.find(lesson => lesson.id === "manual-inside-imported").published, true, "aula manual em módulo importado deve ser preservada");
    assert.equal(lessons.find(lesson => lesson.id === "manual-inside-manual").published, true, "conteúdo manual deve ser preservado");
    assert.equal(removalSync.modulesRemovedFromSource, 1);
    assert.equal(removalSync.lessonsRemovedFromSource, 1);
    assert.equal(removalSync.lessonsUnpublished, 3);
    assert.equal(removalSync.preservedModules, 1);
    assert.equal(removalSync.preservedLessons, 1);
    assert.equal(endedSessions.length, 1);
    assert.deepEqual(new Set(endedSessions[0].where.lessonId.in), new Set([
      lessons.find(lesson => lesson.sourceExternalId === "3111").id,
      lessons.find(lesson => lesson.sourceExternalId === "3112").id,
      lessons.find(lesson => lesson.sourceExternalId === "3121").id,
    ]));
    assert.equal(endedSessions[0].data.blockReason, "source_content_unavailable");

    remoteCourse = {
      ...remoteCourse,
      blocked: true,
      modules: [{
        ...remoteCourse.modules[0],
        lessons: [{ ...remoteCourse.modules[0].lessons[0], blocked: false }],
      }],
    };
    await service.importRemoteCourse("31");
    assert.equal(lessons.find(lesson => lesson.sourceExternalId === "3111").published, false, "curso bloqueado deve manter aula indisponível");

    remoteCourse = { ...remoteCourse, blocked: false };
    await service.importRemoteCourse("31");
    assert.equal(lessons.find(lesson => lesson.sourceExternalId === "3111").published, true, "aula deve voltar quando toda a hierarquia estiver publicada");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
