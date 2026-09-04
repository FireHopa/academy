import { IsEmail, IsIn, IsString, MaxLength, MinLength } from "class-validator";

export const AVATAR_PRESET_IDS = ["aurora", "ocean", "sunset", "forest", "cosmos", "energy", "ruby", "neon", "sky", "gold"] as const;

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(32) @MaxLength(300) token!: string;
  @IsString() @MinLength(10) @MaxLength(120) password!: string;
}

export class AcceptInviteDto {
  @IsString() @MinLength(32) @MaxLength(300) token!: string;
  @IsString() @MinLength(10) @MaxLength(120) password!: string;
}

export class ValidateAccountTokenDto {
  @IsString() @MinLength(32) @MaxLength(300) token!: string;
  @IsIn(["INVITE", "PASSWORD_RESET"]) type!: "INVITE" | "PASSWORD_RESET";
}

export class UpdateProfileDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
}

export class AvatarPresetDto {
  @IsIn([...AVATAR_PRESET_IDS]) avatarPreset!: (typeof AVATAR_PRESET_IDS)[number];
}

export class ChangePasswordDto {
  @IsString() @MinLength(8) @MaxLength(120) currentPassword!: string;
  @IsString() @MinLength(10) @MaxLength(120) newPassword!: string;
}

export class ChangeEmailDto {
  @IsEmail() newEmail!: string;
  @IsString() @MinLength(8) @MaxLength(120) currentPassword!: string;
}

export class CompleteOnboardingDto {
  @IsIn([true]) acceptTerms!: true;
}
