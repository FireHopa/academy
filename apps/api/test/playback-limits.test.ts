import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { PlaybackSessionService } from "../src/video/playback-session.service";
import { config, recorded, rejectsWith, request, student } from "./helpers";

type HarnessOptions = {
  activeDeviceCount?: number;
  existingDevice?: any;
  activeElsewhere?: any[];
};

function harness(options: HarnessOptions = {}) {
  const updateMany = recorded(async () => ({ count: 0 }));
  const deviceCreate = recorded(async (args: any) => ({
    id: "device-new",
    label: args.data.label,
    fingerprint: args.data.fingerprint,
    revokedAt: null,
    userAgent: args.data.userAgent,
    lastIp: args.data.lastIp,
  }));
  const deviceUpdate = recorded(async (args: any) => ({
    ...(options.existingDevice ?? { id: args.where.id, fingerprint: "browser-1", revokedAt: null }),
    ...args.data,
  }));
  const sessionCreate = recorded(async (args: any) => ({
    id: "session-new",
    playbackNonce: args.data.playbackNonce,
    startedAt: new Date("2026-08-18T12:00:00Z"),
    ...args.data,
  }));
  const tx = {
    $executeRaw: async () => 0,
    device: {
      findUnique: async () => options.existingDevice ?? null,
      count: async () => options.activeDeviceCount ?? 0,
      create: deviceCreate,
      update: deviceUpdate,
    },
    watchSession: {
      updateMany,
      findMany: async () => options.activeElsewhere ?? [],
      create: sessionCreate,
    },
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
  const service = new PlaybackSessionService(prisma as any, config({
    MAX_DEVICES_PER_USER: 2,
    MAX_CONCURRENT_STREAMS_PER_USER: 1,
    WATCH_SESSION_HEARTBEAT_SEC: 20,
    WATCH_SESSION_STALE_SEC: 75,
    STAFF_PLAYBACK_LIMIT_BYPASS: false,
  }) as any);
  return { service, updateMany, deviceCreate, deviceUpdate, sessionCreate };
}

const currentDevice = {
  id: "device-current",
  userId: student.sub,
  fingerprint: "browser-1",
  label: "Notebook",
  userAgent: "Browser",
  lastIp: "203.0.113.10",
  lastSeenAt: new Date(),
  revokedAt: null,
  createdAt: new Date(),
};

const otherSession = {
  id: "session-other",
  deviceId: "device-other",
  startedAt: new Date("2026-08-18T11:00:00Z"),
  lastSeenAt: new Date(),
  device: { label: "Celular" },
  lesson: { title: "Outra aula" },
};

test("limite de dispositivos positivo autoriza novo aparelho abaixo do máximo", async () => {
  const { service, deviceCreate, sessionCreate } = harness({ activeDeviceCount: 1 });

  const result = await service.start(student, "lesson-1", {
    deviceFingerprint: "browser-new",
    deviceLabel: "Notebook novo",
  }, request());

  assert.equal(result.device.id, "device-new");
  assert.equal(deviceCreate.calls.length, 1);
  assert.equal(sessionCreate.calls.length, 1);
});

test("limite de dispositivos negativo bloqueia o terceiro aparelho", async () => {
  const { service, deviceCreate, sessionCreate } = harness({ activeDeviceCount: 2 });

  await rejectsWith(service.start(student, "lesson-1", {
    deviceFingerprint: "browser-third",
    deviceLabel: "Terceiro aparelho",
  }, request()), ForbiddenException, /limite de 2 dispositivos/i);

  assert.equal(deviceCreate.calls.length, 0);
  assert.equal(sessionCreate.calls.length, 0);
});

test("limite de streams positivo inicia reprodução quando não existe outra ativa", async () => {
  const { service, sessionCreate } = harness({ existingDevice: currentDevice, activeElsewhere: [] });

  const result = await service.start(student, "lesson-1", {
    deviceFingerprint: currentDevice.fingerprint,
    deviceLabel: currentDevice.label,
  }, request());

  assert.equal(result.session.id, "session-new");
  assert.equal(sessionCreate.calls.length, 1);
  assert.equal(sessionCreate.calls[0][0].data.lastPositionSec, 0);
});

test("nova sessão inicia na posição de retomada já validada", async () => {
  const { service, sessionCreate } = harness({ existingDevice: currentDevice, activeElsewhere: [] });

  await service.start(student, "lesson-1", {
    deviceFingerprint: currentDevice.fingerprint,
  }, request(), false, 420);

  assert.equal(sessionCreate.calls[0][0].data.lastPositionSec, 420);
});

test("limite de streams negativo retorna conflito com a sessão ativa", async () => {
  const { service, sessionCreate } = harness({ existingDevice: currentDevice, activeElsewhere: [otherSession] });

  await rejectsWith(service.start(student, "lesson-1", {
    deviceFingerprint: currentDevice.fingerprint,
  }, request()), ConflictException, /já está reproduzindo/i);

  assert.equal(sessionCreate.calls.length, 0);
});

test("takeover positivo bloqueia reproduções em outros dispositivos e cria nova sessão", async () => {
  const { service, updateMany, sessionCreate } = harness({ existingDevice: currentDevice, activeElsewhere: [otherSession] });

  const result = await service.start(student, "lesson-1", {
    deviceFingerprint: currentDevice.fingerprint,
  }, request(), true);

  const takeoverCall = updateMany.calls.find(([args]) => args.data?.blockReason === "taken_over_by_user");
  assert.ok(takeoverCall);
  assert.equal(takeoverCall![0].data.status, "BLOCKED");
  assert.equal(result.session.id, "session-new");
  assert.equal(sessionCreate.calls.length, 1);
});

test("takeover negativo não contorna o limite de dispositivos", async () => {
  const { service, updateMany, sessionCreate } = harness({ activeDeviceCount: 2, activeElsewhere: [otherSession] });

  await rejectsWith(service.start(student, "lesson-1", {
    deviceFingerprint: "browser-third",
  }, request(), true), ForbiddenException, /limite de 2 dispositivos/i);

  assert.equal(updateMany.calls.some(([args]) => args.data?.blockReason === "taken_over_by_user"), false);
  assert.equal(sessionCreate.calls.length, 0);
});
