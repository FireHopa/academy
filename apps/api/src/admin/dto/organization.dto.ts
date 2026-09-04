import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class CreateCategoryDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
}

export class CourseCategoriesDto {
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) categoryIds!: string[];
}

export class CreateLearningPathDto {
  @IsString() @MinLength(2) @MaxLength(140) title!: string;
  @IsOptional() @IsString() @MaxLength(1200) description?: string;
}

export class UpdateLearningPathDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(140) title?: string;
  @IsOptional() @IsString() @MaxLength(1200) description?: string;
  @IsOptional() @IsUrl({ protocols: ["http", "https"], require_protocol: true }) @MaxLength(2000) heroImageUrl?: string;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

class PathCourseItemDto {
  @IsString() courseId!: string;
  @IsInt() @Min(1) position!: number;
}

export class PathCoursesDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PathCourseItemDto) items!: PathCourseItemDto[];
}
