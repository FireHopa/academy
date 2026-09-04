import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl, Length, ValidateIf, MaxLength } from "class-validator";

enum CourseStatusDto { DRAFT = "DRAFT", PUBLISHED = "PUBLISHED", ARCHIVED = "ARCHIVED" }

export class CreateCourseDto {
  @IsString() @Length(2, 120) title!: string;
  @IsOptional() @IsString() @MaxLength(220) shortDescription?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @ValidateIf((_o, value) => value !== "") @IsUrl({ protocols: ["http", "https"], require_protocol: true }) @MaxLength(2000) heroImageUrl?: string;
  @IsOptional() @ValidateIf((_o, value) => value !== "") @IsUrl({ protocols: ["http", "https"], require_protocol: true }) @MaxLength(2000) cardImageUrl?: string;
}

export class UpdateCourseDto {
  @IsOptional() @IsString() @Length(2, 120) title?: string;
  @IsOptional() @IsString() @MaxLength(220) shortDescription?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @ValidateIf((_o, value) => value !== "") @IsUrl({ protocols: ["http", "https"], require_protocol: true }) @MaxLength(2000) heroImageUrl?: string;
  @IsOptional() @ValidateIf((_o, value) => value !== "") @IsUrl({ protocols: ["http", "https"], require_protocol: true }) @MaxLength(2000) cardImageUrl?: string;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsEnum(CourseStatusDto) status?: CourseStatusDto;
  @IsOptional() @IsBoolean() certificateEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(180) certificateTitle?: string;
}
