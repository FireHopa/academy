import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";

@Injectable()
export class ObservabilityExportGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const expected = this.config.get<string>("OBSERVABILITY_EXPORT_TOKEN")?.trim() ?? "";
    if (expected.length < 32) {
      throw new ServiceUnavailableException("Exportação de observabilidade não configurada");
    }
    const authorization = String(context.switchToHttp().getRequest().headers?.authorization ?? "");
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match || !this.matches(expected, match[1].trim())) {
      throw new UnauthorizedException("Token de observabilidade inválido");
    }
    return true;
  }

  private matches(expected: string, supplied: string) {
    const left = Buffer.from(expected);
    const right = Buffer.from(supplied);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
