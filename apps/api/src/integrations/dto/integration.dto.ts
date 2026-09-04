import { ArrayUnique, IsArray, IsOptional, IsString, MaxLength } from "class-validator";

export class ProductCoursesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  courseIds!: string[];
}

export class ProductReferenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  checkoutReferenceId?: string;
}
