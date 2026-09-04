import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { TheMembersService } from "../src/integrations/themembers.service";
import { config, recorded, rejectsWith } from "./helpers";

const checkoutPayload = Buffer.from(JSON.stringify({
  id: "event-1",
  event: "release.access",
  data: {
    customer: { email: "aluno@example.com", name: "Aluno Teste" },
    product: { id: "product-external-1" },
    subscription: { id: "subscription-1" },
  },
}));

type HarnessOptions = {
  productLookup?: (...args: any[]) => any;
  enabled?: boolean;
  automation?: boolean;
};

function webhookHarness(options: HarnessOptions = {}) {
  let event: any = null;
  const eventCreate = recorded(async (args: any) => {
    event = {
      id: "webhook-event-1",
      status: "RECEIVED",
      error: null,
      processedAt: null,
      receivedAt: new Date(),
      ...args.data,
    };
    return event;
  });
  const eventUpdate = recorded(async (args: any) => {
    event = { ...event, ...args.data };
    return event;
  });
  const productLookup = recorded(options.productLookup ?? (async () => ({
    id: "product-1",
    provider: "THEMEMBERS",
    courses: [{ courseId: "course-1" }],
  })));
  const subscriptionUpsert = recorded(async () => ({ id: "subscription-row-1" }));
  const grantUpsert = recorded(async () => ({ id: "grant-1" }));
  const enrollmentUpsert = recorded(async () => ({ id: "enrollment-1", status: "ACTIVE" }));
  let logSequence = 0;
  const logCreate = recorded(async (args: any) => ({ id: `log-${++logSequence}`, ...args.data }));

  const prisma: Record<string, any> = {
    $executeRaw: async () => 0,
    webhookEvent: {
      findUnique: async () => event,
      create: eventCreate,
      update: eventUpdate,
    },
    externalProduct: { findFirst: productLookup },
    user: { findUnique: async () => ({ id: "user-1", email: "aluno@example.com", name: "Aluno Teste" }) },
    externalSubscription: { upsert: subscriptionUpsert },
    externalAccessGrant: {
      findMany: async (args: any) => args.select?.courseId
        ? []
        : [{ startsAt: new Date(Date.now() - 60_000), expiresAt: null }],
      updateMany: async () => ({ count: 0 }),
      upsert: grantUpsert,
    },
    enrollment: {
      findUnique: async () => null,
      upsert: enrollmentUpsert,
    },
    integrationLog: { create: logCreate },
  };
  prisma.$transaction = async (callback: (tx: typeof prisma) => unknown) => callback(prisma);

  const service = new TheMembersService(prisma as any, config({
    THEMEMBERS_ENABLED: options.enabled === false ? false : true,
    THEMEMBERS_ACCESS_AUTOMATION: options.automation === false ? false : true,
    THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN: "checkout-secret",
  }) as any, { sendInvite: async () => ({}) } as any);

  return { service, eventCreate, eventUpdate, productLookup, subscriptionUpsert, grantUpsert, enrollmentUpsert, logCreate };
}

test("webhook TheMembers positivo libera grant e matrícula para produto mapeado", async () => {
  const { service, subscriptionUpsert, grantUpsert, enrollmentUpsert } = webhookHarness();

  const result = await service.receiveWebhook(checkoutPayload);

  assert.equal(result.status, "PROCESSED");
  assert.equal("action" in result ? result.action : undefined, "granted");
  assert.equal(subscriptionUpsert.calls.length, 1);
  assert.equal(grantUpsert.calls.length, 1);
  assert.equal(enrollmentUpsert.calls.length, 1);
  assert.equal(enrollmentUpsert.calls[0][0].create.source, "THEMEMBERS");
});

test("webhook TheMembers negativo rejeita assinatura incorreta antes do processamento", () => {
  const { service, eventCreate } = webhookHarness();

  assert.doesNotThrow(() => service.verifyCheckoutWebhookToken("checkout-secret"));
  assert.throws(() => service.verifyCheckoutWebhookToken("token-incorreto"), UnauthorizedException);
  assert.equal(eventCreate.calls.length, 0);
});

test("webhook TheMembers negativo rejeita JSON inválido sem reservar evento", async () => {
  const { service, eventCreate } = webhookHarness();

  await rejectsWith(service.receiveWebhook(Buffer.from("{json-invalido")), BadRequestException, /JSON inválido/i);
  assert.equal(eventCreate.calls.length, 0);
});

test("webhook duplicado é idempotente e não concede acesso duas vezes", async () => {
  const { service, subscriptionUpsert, grantUpsert, enrollmentUpsert } = webhookHarness();

  const first = await service.receiveWebhook(checkoutPayload);
  const second = await service.receiveWebhook(checkoutPayload);

  assert.equal(first.status, "PROCESSED");
  assert.equal(second.duplicate, true);
  assert.equal(second.status, "PROCESSED");
  assert.equal(subscriptionUpsert.calls.length, 1);
  assert.equal(grantUpsert.calls.length, 1);
  assert.equal(enrollmentUpsert.calls.length, 1);
});

test("webhook anteriormente FAILED não é descartado como duplicado e pode ser reprocessado", async () => {
  let attempts = 0;
  const { service, productLookup, enrollmentUpsert } = webhookHarness({
    productLookup: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("falha transitória");
      return { id: "product-1", provider: "THEMEMBERS", courses: [{ courseId: "course-1" }] };
    },
  });

  await assert.rejects(() => service.receiveWebhook(checkoutPayload), /falha transitória/i);
  const retry = await service.receiveWebhook(checkoutPayload);

  assert.equal(retry.duplicate, undefined);
  assert.equal(retry.status, "PROCESSED");
  assert.equal(productLookup.calls.length, 2);
  assert.equal(enrollmentUpsert.calls.length, 1);
});
