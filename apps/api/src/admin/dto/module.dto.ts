import { ArrayMaxSize, IsArray, IsInt, IsString, Length, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class CreateModuleDto {
  @IsString() @Length(2, 120) title!: string;
}

class PositionItemDto {
  @IsString() id!: string;
  @IsInt() @Min(1) position!: number;
}

export class ReorderDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PositionItemDto)
  items!: PositionItemDto[];
}
