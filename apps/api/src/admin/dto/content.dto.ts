import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUrl, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";

enum MaterialTypeDto {
  PDF = "PDF",
  LINK = "LINK",
  CHECKLIST = "CHECKLIST",
  SPREADSHEET = "SPREADSHEET",
  PROMPT = "PROMPT",
  FILE = "FILE",
}

export class LessonChapterDto {
  @IsString() @Length(2, 180) title!: string;
  @IsInt() @Min(0) @Max(60 * 60 * 24 * 7) startSec!: number;
}

export class LessonMaterialDto {
  @IsString() @Length(2, 180) title!: string;
  @IsEnum(MaterialTypeDto) type!: MaterialTypeDto;
  @IsString() @IsUrl({ protocols: ["http", "https"], require_protocol: true }) @MaxLength(3000) url!: string;
}

export class LessonContentDto {
  @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @IsArray() @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LessonChapterDto)
  chapters!: LessonChapterDto[];

  @IsArray() @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LessonMaterialDto)
  materials!: LessonMaterialDto[];

  @IsOptional() @IsString() @MaxLength(2_000_000) transcript?: string;
  @IsOptional() @IsString() @MaxLength(20) transcriptLanguage?: string;
}
