export const ACADEMY_QUEUE = "academy-background";
export const WORKER_HEARTBEAT_KEY = "academy:jobs:worker:heartbeat";
export const JOB_DISPATCHER = Symbol.for("academy.job-dispatcher");

export const AcademyJob = {
  STUDENTS_IMPORT: "students.import",
  THEMEMBERS_COURSE_SYNC: "themembers.course.sync",
  THEMEMBERS_PRODUCTS_SYNC: "themembers.products.sync",
  THEMEMBERS_ENROLLMENT_SYNC: "themembers.enrollment.sync",
  THEMEMBERS_RECONCILE: "themembers.reconcile",
  VIDEO_ASSET_CLEANUP: "video-assets.cleanup",
  DATA_RETENTION_CLEANUP: "data-retention.cleanup",
} as const;

export type AcademyJobName = typeof AcademyJob[keyof typeof AcademyJob];

export type StudentImportPayload = {
  rows: Array<{ name: string; email: string; password?: string }>;
  sendInviteEmail?: boolean;
};

export type AcademyJobPayloads = {
  "students.import": StudentImportPayload;
  "themembers.course.sync": { externalId: string };
  "themembers.products.sync": Record<string, never>;
  "themembers.enrollment.sync": { eventId: string };
  "themembers.reconcile": Record<string, never>;
  "video-assets.cleanup": Record<string, never>;
  "data-retention.cleanup": Record<string, never>;
};

export type DispatchOptions = {
  jobId?: string;
  attempts?: number;
};

export type DispatchResult<T = unknown> =
  | { mode: "queued"; queue: string; jobId: string; state: "waiting" }
  | { mode: "inline"; queue: string; jobId: string; result: T };

export interface JobDispatcher {
  dispatch<N extends AcademyJobName>(name: N, payload: AcademyJobPayloads[N], options?: DispatchOptions): Promise<DispatchResult>;
}
