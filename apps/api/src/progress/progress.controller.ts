import { Body, Controller, Param, Patch, Req } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { ProgressService } from "./progress.service";

class UpdateProgressDto {
  @IsInt() @Min(0) @Max(60 * 60 * 24 * 7) positionSec!: number;
  @IsOptional() @IsBoolean() completed?: boolean;
}

@Controller("progress")
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Patch(":lessonId")
  update(@Req() req: AuthenticatedRequest, @Param("lessonId") lessonId: string, @Body() body: UpdateProgressDto) {
    return this.progress.upsert(req.user.sub, req.user.role, lessonId, body.positionSec, body.completed ?? false);
  }
}
