import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { mergeMap } from "rxjs";
import type { AuthUser } from "../auth/auth.types";
import { AUDIT_ACTION_KEY, type AuditActionOptions } from "./audit.decorator";
import { AuditService, sanitizeAuditValue } from "./audit.service";

type AuditRequest = Request & { user?: AuthUser; requestId?: string };

function resultPath(value: unknown, path?: string) {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly audit: AuditService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== "http") return next.handle();
    const options = this.reflector.getAllAndOverride<AuditActionOptions>(AUDIT_ACTION_KEY, [context.getHandler(), context.getClass()]);
    if (!options) return next.handle();

    const request = context.switchToHttp().getRequest<AuditRequest>();
    const params = request.params as Record<string, string>;
    const initialEntityId = options.entityIdParam ? params?.[options.entityIdParam] : undefined;
    const before = options.snapshot && initialEntityId ? await this.audit.snapshot(options.entityType, initialEntityId) : undefined;
    const requestMetadata = options.captureRequest === false ? undefined : sanitizeAuditValue({ body: request.body, query: request.query });

    return next.handle().pipe(mergeMap(async result => {
      const entityIdValue = resultPath(result, options.entityIdResultPath) ?? initialEntityId;
      const entityId = entityIdValue === undefined || entityIdValue === null ? undefined : String(entityIdValue);
      let after: unknown;
      if (!options.deleted && options.snapshot && entityId) after = await this.audit.snapshot(options.entityType, entityId);
      if (!options.deleted && after === undefined && options.captureResult !== false) after = sanitizeAuditValue(result);
      const userAgent = request.get?.("user-agent") || request.headers?.["user-agent"];
      await this.audit.record({
        actorUserId: request.user?.sub,
        actorName: request.user?.name || "Administrador",
        actorEmail: request.user?.email || "desconhecido",
        action: options.action,
        entityType: options.entityType,
        entityId,
        before,
        after,
        metadata: {
          method: request.method,
          path: String(request.originalUrl || request.url || "").split("?")[0],
          ...(requestMetadata === undefined ? {} : { request: requestMetadata }),
        },
        ipAddress: request.ip || request.socket?.remoteAddress,
        userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
        requestId: request.requestId || randomUUID(),
      });
      return result;
    }));
  }
}
