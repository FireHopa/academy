import { Body, Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/auth.guard";
import { DirectImageUploadDto, RemoveManagedImageDto } from "./image-storage.dto";
import { ImageStorageService } from "./image-storage.service";

@Controller("admin/media/images")
@UseGuards(AdminGuard)
export class MediaController {
  constructor(private readonly images: ImageStorageService) {}

  @Get("status")
  status() {
    return this.images.storageStatus();
  }

  @Post("presign")
  presign(@Body() body: DirectImageUploadDto) {
    return this.images.createDirectUpload(body.preset, body.size);
  }

  @Delete()
  async remove(@Body() body: RemoveManagedImageDto) {
    await this.images.removeManaged(body.url);
    return { ok: true };
  }
}
