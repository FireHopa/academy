import { IsIn, IsInt, IsString, IsUrl, Max, Min } from "class-validator";
import { MAX_IMAGE_UPLOAD_BYTES, type ImagePreset } from "./image-storage.service";

export class DirectImageUploadDto {
  @IsIn(["course-card", "course-hero", "path-hero", "avatar"])
  preset!: ImagePreset;

  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_UPLOAD_BYTES)
  size!: number;
}

export class RemoveManagedImageDto {
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  url!: string;
}
