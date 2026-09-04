import { SetMetadata } from "@nestjs/common";

export const AUDIT_ACTION_KEY = "academy:audit-action";

export type AuditActionOptions = {
  action: string;
  entityType: string;
  entityIdParam?: string;
  entityIdResultPath?: string;
  snapshot?: boolean;
  deleted?: boolean;
  captureRequest?: boolean;
  captureResult?: boolean;
};

export const AuditAction = (options: AuditActionOptions) => SetMetadata(AUDIT_ACTION_KEY, options);
