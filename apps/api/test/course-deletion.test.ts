import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { AdminService } from "../src/admin/admin.service";
import { recorded, rejectsWith } from "./helpers";

test("exclui o curso e remove as imagens administradas", async () => {
  const removeManaged = recorded(async () => undefined);
  const deleteCourse = recorded(async () => ({}));
  const markDetached = recorded(async () => ({ touched: 2 }));
  const prisma = {
    course: {
      findUnique: async () => ({
        id: "course-1",
        title: "Curso teste",
        heroImageUrl: "https://academy.test/uploads/images/11111111-1111-1111-1111-111111111111.webp",
        cardImageUrl: "https://academy.test/uploads/images/22222222-2222-2222-2222-222222222222.webp",
      }),
      delete: deleteCourse,
    },
    lesson: {
      findMany: async () => [{ videoResourceId: "asset-1" }, { videoResourceId: "asset-2" }],
    },
  };
  const service = new AdminService(prisma as any, {} as any, { removeManaged } as any, undefined, { markDetached } as any);

  const result = await service.deleteCourse("course-1");

  assert.deepEqual(result, { ok: true, message: "Curso teste foi excluído.", id: "course-1" });
  assert.deepEqual(deleteCourse.calls[0][0], { where: { id: "course-1" } });
  assert.deepEqual(markDetached.calls[0], [["asset-1", "asset-2"]]);
  assert.deepEqual(removeManaged.calls.map(call => call[0]), [
    "https://academy.test/uploads/images/11111111-1111-1111-1111-111111111111.webp",
    "https://academy.test/uploads/images/22222222-2222-2222-2222-222222222222.webp",
  ]);
});

test("não tenta excluir um curso inexistente", async () => {
  const deleteCourse = recorded(async () => ({}));
  const service = new AdminService({
    course: { findUnique: async () => null, delete: deleteCourse },
  } as any, {} as any);

  await rejectsWith(service.deleteCourse("missing"), NotFoundException, /Curso não encontrado/i);
  assert.equal(deleteCourse.calls.length, 0);
});

test("exclusão de curso reinicia a carência dos vídeos antes do cascade", async () => {
  const calls: string[] = [];
  const markDetached = recorded(async (ids: string[]) => { calls.push(`mark:${ids.join(",")}`); });
  const prisma = {
    course: {
      findUnique: async () => ({ id: "course-1", title: "Curso", heroImageUrl: null, cardImageUrl: null }),
      delete: async () => { calls.push("delete:course"); },
    },
    lesson: {
      findMany: async () => [{ videoResourceId: "asset-1" }, { videoResourceId: "asset-2" }],
    },
  };
  const service = new AdminService(prisma as any, {} as any, undefined, undefined, { markDetached } as any);

  await service.deleteCourse("course-1");

  assert.deepEqual(calls, ["mark:asset-1,asset-2", "delete:course"]);
});
