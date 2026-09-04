import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { PANDA_VIDEO_STATUSES } from "../providers/panda-video.provider";

export class AttachPandaVideoDto {
  @IsString()
  @IsUUID()
  videoId!: string;
}

export class ListPandaVideosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page = 1;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @IsIn(PANDA_VIDEO_STATUSES)
  status?: string;
}
