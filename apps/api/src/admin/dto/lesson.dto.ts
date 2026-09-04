import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";

export class CreateLessonDto {
  @IsString() @Length(2, 180) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(60 * 60 * 24 * 7) durationSec?: number;
  @IsOptional() @IsBoolean() preview?: boolean;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class UpdateLessonDto {
  @IsOptional() @IsString() @Length(2, 180) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(60 * 60 * 24 * 7) durationSec?: number;
  @IsOptional() @IsBoolean() preview?: boolean;
  @IsOptional() @IsBoolean() published?: boolean;
}
