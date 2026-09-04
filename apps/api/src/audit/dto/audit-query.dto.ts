import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class AuditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(100) pageSize = 25;
  @IsOptional() @IsString() @MaxLength(100) action?: string;
  @IsOptional() @IsString() @MaxLength(80) entityType?: string;
  @IsOptional() @IsString() @MaxLength(100) actorUserId?: string;
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
