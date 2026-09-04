import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import type { AuthUser } from "./auth.types";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { ALLOW_PRE_ONBOARDING_KEY } from "./pre-onboarding.decorator";

export type AuthenticatedRequest = Request & { user: AuthUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.academy_session as string | undefined;
    if (!token) throw new UnauthorizedException("Faça login para continuar");
    const decoded = this.auth.verifyToken(token);
    request.user = await this.auth.validateSession(decoded);
    const allowPreOnboarding = this.reflector.getAllAndOverride<boolean>(ALLOW_PRE_ONBOARDING_KEY, [context.getHandler(), context.getClass()]);
    if (request.user.role === "STUDENT" && !request.user.onboardingCompleted && !allowPreOnboarding) {
      throw new ForbiddenException({ code: "ONBOARDING_REQUIRED", message: "Conclua seu primeiro acesso para continuar." });
    }
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role !== "ADMIN") throw new ForbiddenException("Acesso restrito a administradores");
    return true;
  }
}
