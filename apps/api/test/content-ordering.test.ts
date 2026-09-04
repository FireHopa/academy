import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../src/admin/admin.service";

test("salva capítulos na ordem definida pelo administrador", async () => {
  const createdChapters: Array<{ title:string; startSec:number; position:number }> = [];
  const transaction = {
    lesson: { update: async () => ({}) },
    lessonChapter: {
      deleteMany: async () => ({}),
      create: async ({data}:{data:{title:string;startSec:number;position:number}}) => { createdChapters.push(data); return data; },
    },
    lessonMaterial: { deleteMany: async () => ({}), create: async () => ({}) },
    lessonTranscript: { upsert: async () => ({}), deleteMany: async () => ({}) },
  };
  const prisma = {
    lesson: {
      findUnique: async ({select}:{select?:unknown}) => select
        ? { id:"lesson-1", moduleId:"module-1" }
        : { id:"lesson-1", chapters:[], materials:[], transcript:null, module:{course:{}} },
    },
    $transaction: async (callback:(tx:typeof transaction)=>Promise<void>) => callback(transaction),
  };
  const service = new AdminService(prisma as never, {} as never);

  await service.saveLessonContent("lesson-1", {
    description: "",
    chapters: [
      { title:"Segundo assunto", startSec:120 },
      { title:"Introdução", startSec:0 },
    ],
    materials: [],
    transcript: "",
  });

  assert.deepEqual(createdChapters.map(chapter=>({title:chapter.title,position:chapter.position})), [
    { title:"Segundo assunto", position:1 },
    { title:"Introdução", position:2 },
  ]);
});
