import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class PlaybackDeviceDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  deviceFingerprint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;
}

export class HeartbeatDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60 * 60 * 24)
  positionSec?: number;
}
