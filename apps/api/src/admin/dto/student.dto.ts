import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import { IsCpf, normalizeCpf } from "../../common/cpf";

export class CreateStudentDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(120) password?: string;
  @IsOptional() @IsBoolean() sendInviteEmail?: boolean;
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? normalizeCpf(value) : value) @IsString() @IsCpf() cpf?: string;
  @IsOptional() @IsString() @Matches(/^\d{10,15}$/, { message: "Telefone deve conter entre 10 e 15 dígitos" }) phone?: string;
  @IsOptional() @IsString() @MaxLength(100) courseId?: string;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() expiresAt?: string | null;
}

export class ImportStudentRowDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(120) password?: string;
}

export class ImportStudentsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowDto)
  rows!: ImportStudentRowDto[];

  @IsOptional() @IsBoolean() sendInviteEmail?: boolean;
}

export class StudentStatusDto {
  @IsIn(["ACTIVE", "BLOCKED"]) status!: "ACTIVE" | "BLOCKED";
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class GrantEnrollmentDto {
  @IsString() courseId!: string;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() expiresAt?: string | null;
}

export class UpdateEnrollmentDto {
  @IsOptional() @IsIn(["ACTIVE", "EXPIRED", "CANCELLED"]) status?: "ACTIVE" | "EXPIRED" | "CANCELLED";
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() expiresAt?: string | null;
}

export class SendNotificationDto {
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @IsString() @MinLength(2) @MaxLength(1200) message!: string;
  @IsOptional() @IsString() @MaxLength(500) linkUrl?: string;
}
