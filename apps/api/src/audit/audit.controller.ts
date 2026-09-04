import { Controller, Get, Header, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/auth.guard";
import { AuditService } from "./audit.service";
import { AuditQueryDto } from "./dto/audit-query.dto";

@Controller("admin/audit-logs")
@UseGuards(AdminGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Header("Cache-Control", "no-store, private")
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}
