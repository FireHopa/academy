ALTER TABLE "Course"
ADD COLUMN "sourceProvider" "IntegrationProvider",
ADD COLUMN "sourceExternalId" TEXT,
ADD COLUMN "sourceSyncedAt" TIMESTAMP(3);

ALTER TABLE "CourseModule"
ADD COLUMN "sourceProvider" "IntegrationProvider",
ADD COLUMN "sourceExternalId" TEXT,
ADD COLUMN "sourceSyncedAt" TIMESTAMP(3);

ALTER TABLE "Lesson"
ADD COLUMN "sourceProvider" "IntegrationProvider",
ADD COLUMN "sourceExternalId" TEXT,
ADD COLUMN "sourceSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Course_sourceProvider_sourceExternalId_key"
ON "Course"("sourceProvider", "sourceExternalId");

CREATE UNIQUE INDEX "CourseModule_sourceProvider_sourceExternalId_key"
ON "CourseModule"("sourceProvider", "sourceExternalId");

CREATE UNIQUE INDEX "Lesson_sourceProvider_sourceExternalId_key"
ON "Lesson"("sourceProvider", "sourceExternalId");
