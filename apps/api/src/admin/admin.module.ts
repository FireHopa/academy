import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { VideoModule } from "../video/video.module";
import { MediaModule } from "../media/media.module";

@Module({ imports: [AuthModule, VideoModule, MediaModule], controllers: [AdminController], providers: [AdminService], exports: [AdminService] })
export class AdminModule {}
