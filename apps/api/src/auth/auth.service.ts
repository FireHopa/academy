import { ConflictException, ForbiddenException, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { sign, verify } from "jsonwebtoken";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "./auth.types";
import { MailService } from "./mail.service";
import { ImageStorageService, type UploadedImageFile } from "../media/image-storage.service";
import { SessionCacheService } from "../redis/session-cache.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly images: ImageStorageService,
    @Optional() private readonly sessionCache?: SessionCacheService,
  ) {}

  async validateCredentials(email: string, password: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user?.passwordHash || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException("E-mail ou senha inválidos");
    }
    if (user.status === "BLOCKED") throw new ForbiddenException("Esta conta está bloqueada. Entre em contato com o suporte.");
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const authUser = this.toAuthUser(user);
    await this.sessionCache?.set(authUser);
    return authUser;
  }

  async validateSession(user: AuthUser): Promise<AuthUser> {
    const cached = await this.sessionCache?.get(user.sub);
    if (cached && cached.ver === user.ver) return cached;
    const current = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { id: true, email: true, name: true, role: true, status: true, sessionVersion: true, onboardingCompletedAt: true },
    });
    if (!current) throw new UnauthorizedException("Usuário não encontrado");
    if (current.status === "BLOCKED") throw new ForbiddenException("Esta conta está bloqueada");
    if (user.ver !== current.sessionVersion) throw new UnauthorizedException("Sua sessão foi renovada. Entre novamente.");
    const validated: AuthUser = {
      sub: current.id, email: current.email, name: current.name, role: current.role,
      ver: current.sessionVersion, onboardingCompleted: Boolean(current.onboardingCompletedAt),
    };
    await this.sessionCache?.set(validated);
    return validated;
  }

  issueToken(user: AuthUser) {
    return sign(user, this.secret(), { expiresIn: "12h" });
  }

  verifyToken(token: string): AuthUser {
    try { return verify(token, this.secret()) as AuthUser; }
    catch { throw new UnauthorizedException("Sessão inválida ou expirada"); }
  }

  async createInvite(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, status: true } });
    if (!user) throw new UnauthorizedException("Usuário não encontrado");
    if (user.status === "BLOCKED") throw new ForbiddenException("Usuário bloqueado");
    const token = await this.createOneTimeToken(user.id, "INVITE", 72 * 60 * 60 * 1000);
    return { token, url: `${this.webUrl()}/invite?token=${encodeURIComponent(token)}`, user };
  }

  async sendInvite(userId: string) {
    const invite = await this.createInvite(userId);
    try {
      const result = await this.mail.send(invite.user.email, "Convite para acessar a Casa do Ads", `<p>Olá, ${this.escapeHtml(invite.user.name)}.</p><p>Defina sua senha para acessar a plataforma:</p><p><a href="${invite.url}">Criar minha senha</a></p><p>O link expira em 72 horas.</p>`);
      return { ...invite, delivered: result.delivered };
    } catch {
      return { ...invite, delivered: false };
    }
  }

  async requestPasswordReset(email: string) {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalized }, select: { id: true, name: true, email: true, status: true } });
    if (!user || user.status === "BLOCKED") return { ok: true };
    const token = await this.createOneTimeToken(user.id, "PASSWORD_RESET", 60 * 60 * 1000);
    const url = `${this.webUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await this.mail.send(user.email, "Recuperação de senha da Casa do Ads", `<p>Olá, ${this.escapeHtml(user.name)}.</p><p>Use o link abaixo para criar uma nova senha:</p><p><a href="${url}">Redefinir senha</a></p><p>O link expira em 1 hora.</p>`);
    } catch (error) {
      console.error("Falha ao enviar recuperação de senha", error);
    }
    return { ok: true, ...(this.config.get("NODE_ENV") !== "production" ? { devResetUrl: url } : {}) };
  }

  async validateAccountToken(rawToken: string, type: "INVITE" | "PASSWORD_RESET") {
    const token = await this.findValidToken(rawToken, type);
    return { valid: true, user: { name: token.user.name, email: token.user.email } };
  }

  async acceptInvite(rawToken: string, password: string) {
    const token = await this.findValidToken(rawToken, "INVITE");
    const now = new Date();
    const updated = await this.prisma.$transaction(async tx => {
      const consumed = await tx.accountToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (consumed.count !== 1) throw new UnauthorizedException("Link inválido ou já utilizado");
      await tx.accountToken.updateMany({ where: { userId: token.userId, type: "INVITE", usedAt: null }, data: { usedAt: now } });
      return tx.user.update({
        where: { id: token.userId },
        data: { passwordHash: await hash(password, 12), passwordChangedAt: now, inviteAcceptedAt: now, sessionVersion: { increment: 1 } },
      });
    });
    const user = this.toAuthUser(updated);
    await this.sessionCache?.set(user);
    return { user, token: this.issueToken(user) };
  }

  async resetPassword(rawToken: string, password: string) {
    const token = await this.findValidToken(rawToken, "PASSWORD_RESET");
    const now = new Date();
    await this.prisma.$transaction(async tx => {
      const consumed = await tx.accountToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (consumed.count !== 1) throw new UnauthorizedException("Link inválido ou já utilizado");
      await tx.accountToken.updateMany({ where: { userId: token.userId, type: "PASSWORD_RESET", usedAt: null }, data: { usedAt: now } });
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash: await hash(password, 12), passwordChangedAt: now, sessionVersion: { increment: 1 } } });
      await tx.watchSession.updateMany({ where: { userId: token.userId, status: "ACTIVE" }, data: { status: "BLOCKED", endedAt: now, blockReason: "password_reset" } });
    });
    await this.sessionCache?.invalidate(token.userId);
    return { ok: true };
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, avatarUrl: true, role: true, termsAcceptedAt: true, termsVersion: true, onboardingCompletedAt: true, lastLoginAt: true, createdAt: true } });
    if (!user) throw new UnauthorizedException("Usuário não encontrado");
    return { user };
  }

  async updateProfile(userId: string, name: string) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { name: name.trim() }, select: { id: true, name: true, email: true, avatarUrl: true } });
    await this.sessionCache?.invalidate(userId);
    return user;
  }

  async setAvatarPreset(userId: string, avatarPreset: string) {
    const current = await this.avatarOwner(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: `avatar:${avatarPreset}` },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
    await this.images.removeManaged(current.avatarUrl);
    return { user };
  }

  async uploadAvatar(userId: string, file?: UploadedImageFile) {
    const current = await this.avatarOwner(userId);
    const stored = await this.images.store(file, "avatar");
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: stored.url },
        select: { id: true, name: true, email: true, avatarUrl: true },
      });
      await this.images.removeManaged(current.avatarUrl);
      return { ...stored, user };
    } catch (error) {
      await this.images.removeManaged(stored.url);
      throw error;
    }
  }

  async removeAvatar(userId: string) {
    const current = await this.avatarOwner(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
    await this.images.removeManaged(current.avatarUrl);
    return { user };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await compare(currentPassword, user.passwordHash))) throw new UnauthorizedException("Senha atual incorreta");
    if (await compare(newPassword, user.passwordHash)) throw new ConflictException("A nova senha precisa ser diferente da atual");
    const now = new Date();
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hash(newPassword, 12), passwordChangedAt: now, sessionVersion: { increment: 1 } } });
    await this.prisma.watchSession.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "BLOCKED", endedAt: now, blockReason: "password_changed" } });
    const authUser = this.toAuthUser(updated);
    await this.sessionCache?.set(authUser);
    return { user: authUser, token: this.issueToken(authUser) };
  }

  async changeEmail(userId: string, newEmail: string, currentPassword: string) {
    const email = newEmail.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await compare(currentPassword, user.passwordHash))) throw new UnauthorizedException("Senha atual incorreta");
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing && existing.id !== userId) throw new ConflictException("Este e-mail já está em uso");
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { email, sessionVersion: { increment: 1 } } });
    const authUser = this.toAuthUser(updated);
    await this.sessionCache?.set(authUser);
    return { user: authUser, token: this.issueToken(authUser) };
  }

  async completeOnboarding(userId: string) {
    const now = new Date();
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { termsAcceptedAt: now, termsVersion: this.config.get<string>("TERMS_VERSION") || "v1", onboardingCompletedAt: now } });
    const user = this.toAuthUser(updated);
    await this.sessionCache?.set(user);
    return { user, token: this.issueToken(user) };
  }

  private async createOneTimeToken(userId: string, type: "INVITE" | "PASSWORD_RESET", ttlMs: number) {
    const raw = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.prisma.$transaction([
      this.prisma.accountToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.accountToken.create({ data: { userId, type, tokenHash, expiresAt } }),
    ]);
    return raw;
  }

  private async findValidToken(rawToken: string, type: "INVITE" | "PASSWORD_RESET") {
    const token = await this.prisma.accountToken.findUnique({ where: { tokenHash: this.hashToken(rawToken) }, include: { user: true } });
    if (!token || token.type !== type || token.usedAt || token.expiresAt <= new Date() || token.user.status === "BLOCKED") throw new UnauthorizedException("Link inválido ou expirado");
    return token;
  }

  private toAuthUser(user: { id: string; email: string; name: string; role: "STUDENT" | "INSTRUCTOR" | "ADMIN"; sessionVersion: number; onboardingCompletedAt: Date | null }): AuthUser {
    return { sub: user.id, email: user.email, name: user.name, role: user.role, ver: user.sessionVersion, onboardingCompleted: Boolean(user.onboardingCompletedAt) };
  }

  private hashToken(raw: string) { return createHash("sha256").update(raw).digest("hex"); }
  private async avatarOwner(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    if (!user) throw new UnauthorizedException("Usuário não encontrado");
    return user;
  }
  private secret() { return this.config.getOrThrow<string>("JWT_SECRET"); }
  private webUrl() { return (this.config.get<string>("WEB_URL") ?? "http://localhost:3000").replace(/\/$/, ""); }
  private escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char)); }
}
