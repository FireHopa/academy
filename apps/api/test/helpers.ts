import assert from "node:assert/strict";
import type { Request } from "express";

export function config(values: Record<string, unknown> = {}) {
  return {
    get<T = unknown>(key: string): T | undefined {
      return values[key] as T | undefined;
    },
    getOrThrow<T = unknown>(key: string): T {
      if (!(key in values)) throw new Error(`Configuração ausente: ${key}`);
      return values[key] as T;
    },
  };
}

export type RecordedFunction<T = unknown> = ((...args: any[]) => T) & { calls: any[][] };

export function recorded<T = unknown>(implementation?: (...args: any[]) => T): RecordedFunction<T> {
  const calls: any[][] = [];
  const fn = ((...args: any[]) => {
    calls.push(args);
    return implementation ? implementation(...args) : undefined as T;
  }) as RecordedFunction<T>;
  fn.calls = calls;
  return fn;
}

export function request(ip = "203.0.113.10", userAgent = "Academy Test Browser") {
  return {
    ip,
    socket: { remoteAddress: ip },
    get(name: string) { return name.toLowerCase() === "user-agent" ? userAgent : undefined; },
  } as unknown as Request;
}

export async function rejectsWith(
  action: Promise<unknown> | (() => Promise<unknown>),
  ErrorType: new (...args: any[]) => Error,
  message?: RegExp,
) {
  const run = typeof action === "function" ? action : () => action;
  await assert.rejects(run, error => {
    assert.ok(error instanceof ErrorType, `Esperava ${ErrorType.name}, recebeu ${(error as Error)?.constructor?.name}`);
    if (message) assert.match((error as Error).message, message);
    return true;
  });
}

export const student = {
  sub: "user-1",
  email: "aluno@example.com",
  name: "Aluno Teste",
  role: "STUDENT" as const,
  ver: 1,
  onboardingCompleted: true,
};
