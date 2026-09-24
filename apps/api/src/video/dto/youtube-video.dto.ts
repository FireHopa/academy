import { IsInt, IsString, Max, MaxLength, Min } from "class-validator";

export class AttachYoutubeVideoDto {
  @IsString()
  @MaxLength(500)
  url!: string;

  @IsInt()
  @Min(1)
  @Max(60 * 60 * 24 * 7)
  durationSec!: number;
}
