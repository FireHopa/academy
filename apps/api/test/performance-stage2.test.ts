import assert from "node:assert/strict";
import { test } from "node:test";
import { ExperienceService } from "../src/experience/experience.service";
import { resolveTrustProxy } from "../src/common/trust-proxy";
import { RedisThrottlerStorage } from "../src/redis/redis-throttler.storage";
import { SessionCacheService } from "../src/redis/session-cache.service";
import { config, recorded, student } from "./helpers";

test("catálogo filtra, conta e pagina no banco antes de carregar relações", async () => {
  const findMany = recorded(async () => []);
  const count = recorded(async () => 73);
  const service = new ExperienceService({
    course: { findMany, count },
  } as any);

  const result = await service.catalog(student.sub, "Google Ads", undefined, 3, 12);

  assert.equal(result.total, 73);
  assert.equal(result.page, 3);
  assert.equal(result.pages, 7);
  assert.equal(result.hasMore, true);
  assert.equal(findMany.calls[0][0].skip, 24);
  assert.equal(findMany.calls[0][0].take, 12);
  assert.equal(findMany.calls[0][0].where.status, "PUBLISHED");
  assert.equal(findMany.calls[0][0].where.OR[0].title.contains, "Google Ads");
  assert.equal(findMany.calls[0][0].select.modules.select.lessons.select.description, undefined);
  assert.equal(count.calls[0][0].where.status, "PUBLISHED");
});

test("biblioteca limita matrículas e favoritos antes de buscar os cards", async () => {
  const enrollmentFindMany = recorded(async () => []);
  const favoriteFindMany = recorded(async () => []);
  const courseFindMany = recorded(async () => []);
  const service = new ExperienceService({
    enrollment: { count: async () => 80, findMany: enrollmentFindMany },
    favorite: { count: async () => 0, findMany: favoriteFindMany },
    course: { findMany: courseFindMany },
  } as any);

  const result = await service.library(student.sub, 2, 24);

  assert.equal(result.total, 80);
  assert.equal(result.pages, 4);
  assert.equal(enrollmentFindMany.calls[0][0].skip, 24);
  assert.equal(enrollmentFindMany.calls[0][0].take, 24);
  assert.equal(favoriteFindMany.calls[0][0].skip, 0);
  assert.equal(favoriteFindMany.calls[0][0].take, 24);
  assert.deepEqual(courseFindMany.calls[0][0].where.id.in, []);
});

test("cache compartilhado de sessão grava TTL, valida payload e invalida a chave", async () => {
  const values = new Map<string, string>();
  const setEx = recorded(async (key: string, _ttl: number, value: string) => { values.set(key, value); return "OK"; });
  const del = recorded(async (key: string) => values.delete(key) ? 1 : 0);
  const cache = new SessionCacheService({
    get: async (key: string) => values.get(key) ?? null,
    setEx,
    del,
  } as any, config({ SESSION_CACHE_TTL_SEC: 45 }) as any);

  await cache.set(student);
  assert.deepEqual(await cache.get(student.sub), student);
  assert.equal(setEx.calls[0][1], 45);
  await cache.invalidate(student.sub);
  assert.equal(await cache.get(student.sub), null);
  assert.equal(del.calls.length, 1);
});

test("storage de rate limit converte o resultado atômico do Redis", async () => {
  const evalRedis = recorded(async () => [6, 41, 1, 20]);
  const storage = new RedisThrottlerStorage({ eval: evalRedis } as any);

  const result = await storage.increment("route-user", 60_000, 5, 20_000, "default");

  assert.deepEqual(result, { totalHits: 6, timeToExpire: 41, isBlocked: true, timeToBlockExpire: 20 });
  assert.match(evalRedis.calls[0][1][0], /^academy:throttle:default:/);
});

test("trust proxy aceita hops e redes explícitas sem confiar por padrão", () => {
  assert.equal(resolveTrustProxy(undefined), false);
  assert.equal(resolveTrustProxy("true"), 1);
  assert.equal(resolveTrustProxy("2"), 2);
  assert.equal(resolveTrustProxy("loopback, 10.0.0.0/8"), "loopback, 10.0.0.0/8");
  assert.equal(resolveTrustProxy("false"), false);
});
