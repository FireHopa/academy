-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'INSTRUCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AccountTokenType" AS ENUM ('INVITE', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'TEXT', 'LIVE');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WatchSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('EMPTY', 'UPLOADING', 'PROCESSING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('PDF', 'LINK', 'CHECKLIST', 'SPREADSHEET', 'PROMPT', 'FILE');

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('PANDA', 'MUX');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('PANDA', 'THEMEMBERS');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "passwordChangedAt" TIMESTAMP(3),
    "inviteAcceptedAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" TEXT,
    "heroImageUrl" TEXT,
    "cardImageUrl" TEXT,
    "trailerAssetId" TEXT,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT true,
    "certificateTitle" TEXT,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "LessonType" NOT NULL DEFAULT 'VIDEO',
    "position" INTEGER NOT NULL,
    "durationSec" INTEGER,
    "videoUploadId" TEXT,
    "videoAssetId" TEXT,
    "videoPlaybackId" TEXT,
    "videoStatus" "VideoStatus" NOT NULL DEFAULT 'EMPTY',
    "videoError" TEXT,
    "preview" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "videoResourceId" TEXT,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "positionSec" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPath" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "heroImageUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPathCourse" (
    "learningPathId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "LearningPathCourse_pkey" PRIMARY KEY ("learningPathId","courseId")
);

-- CreateTable
CREATE TABLE "LessonChapter" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startSec" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonMaterial" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MaterialType" NOT NULL DEFAULT 'LINK',
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonTranscript" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccountTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "label" TEXT,
    "userAgent" TEXT,
    "lastIp" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "deviceId" TEXT,
    "playbackNonce" TEXT NOT NULL,
    "ipAddress" TEXT,
    "status" "WatchSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "blockReason" TEXT,
    "lastPositionSec" INTEGER NOT NULL DEFAULT 0,
    "watchedSec" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "WatchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" TEXT NOT NULL,
    "provider" "VideoProvider" NOT NULL,
    "providerAssetId" TEXT NOT NULL,
    "providerExternalId" TEXT,
    "providerLibraryId" TEXT,
    "playerUrl" TEXT,
    "thumbnailUrl" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'PROCESSING',
    "durationSec" INTEGER,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalProduct" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "productCode" TEXT,
    "checkoutReferenceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT,
    "raw" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCourse" (
    "externalProductId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "ProductCourse_pkey" PRIMARY KEY ("externalProductId","courseId")
);

-- CreateTable
CREATE TABLE "ExternalCustomer" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSubscription" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "externalSubscriptionId" TEXT,
    "userId" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paymentLastDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalAccessGrant" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CategoryToCourse" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CategoryToCourse_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX "CourseModule_courseId_idx" ON "CourseModule"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseModule_courseId_position_key" ON "CourseModule"("courseId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_videoUploadId_key" ON "Lesson"("videoUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_videoAssetId_key" ON "Lesson"("videoAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_videoPlaybackId_key" ON "Lesson"("videoPlaybackId");

-- CreateIndex
CREATE INDEX "Lesson_moduleId_idx" ON "Lesson"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_moduleId_position_key" ON "Lesson"("moduleId", "position");

-- CreateIndex
CREATE INDEX "Enrollment_userId_idx" ON "Enrollment"("userId");

-- CreateIndex
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId", "courseId");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_idx" ON "LessonProgress"("userId");

-- CreateIndex
CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_courseId_key" ON "Favorite"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningPath_slug_key" ON "LearningPath"("slug");

-- CreateIndex
CREATE INDEX "LearningPathCourse_courseId_idx" ON "LearningPathCourse"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningPathCourse_learningPathId_position_key" ON "LearningPathCourse"("learningPathId", "position");

-- CreateIndex
CREATE INDEX "LessonChapter_lessonId_startSec_idx" ON "LessonChapter"("lessonId", "startSec");

-- CreateIndex
CREATE UNIQUE INDEX "LessonChapter_lessonId_position_key" ON "LessonChapter"("lessonId", "position");

-- CreateIndex
CREATE INDEX "LessonMaterial_lessonId_idx" ON "LessonMaterial"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonMaterial_lessonId_position_key" ON "LessonMaterial"("lessonId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "LessonTranscript_lessonId_key" ON "LessonTranscript"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_code_key" ON "Certificate"("code");

-- CreateIndex
CREATE INDEX "Certificate_userId_issuedAt_idx" ON "Certificate"("userId", "issuedAt");

-- CreateIndex
CREATE INDEX "Certificate_courseId_idx" ON "Certificate"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_userId_courseId_key" ON "Certificate"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountToken_userId_type_expiresAt_idx" ON "AccountToken"("userId", "type", "expiresAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Device_userId_revokedAt_idx" ON "Device"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_fingerprint_key" ON "Device"("userId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "WatchSession_playbackNonce_key" ON "WatchSession"("playbackNonce");

-- CreateIndex
CREATE INDEX "WatchSession_userId_status_lastSeenAt_idx" ON "WatchSession"("userId", "status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "WatchSession_lessonId_idx" ON "WatchSession"("lessonId");

-- CreateIndex
CREATE INDEX "WatchSession_deviceId_status_idx" ON "WatchSession"("deviceId", "status");

-- CreateIndex
CREATE INDEX "VideoAsset_provider_providerExternalId_idx" ON "VideoAsset"("provider", "providerExternalId");

-- CreateIndex
CREATE INDEX "VideoAsset_status_idx" ON "VideoAsset"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_provider_providerAssetId_key" ON "VideoAsset"("provider", "providerAssetId");

-- CreateIndex
CREATE INDEX "ExternalProduct_provider_productCode_idx" ON "ExternalProduct"("provider", "productCode");

-- CreateIndex
CREATE INDEX "ExternalProduct_provider_checkoutReferenceId_idx" ON "ExternalProduct"("provider", "checkoutReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalProduct_provider_externalId_key" ON "ExternalProduct"("provider", "externalId");

-- CreateIndex
CREATE INDEX "ProductCourse_courseId_idx" ON "ProductCourse"("courseId");

-- CreateIndex
CREATE INDEX "ExternalCustomer_email_idx" ON "ExternalCustomer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCustomer_provider_externalId_key" ON "ExternalCustomer"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCustomer_provider_userId_key" ON "ExternalCustomer"("provider", "userId");

-- CreateIndex
CREATE INDEX "ExternalSubscription_externalSubscriptionId_idx" ON "ExternalSubscription"("externalSubscriptionId");

-- CreateIndex
CREATE INDEX "ExternalSubscription_expiresAt_idx" ON "ExternalSubscription"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSubscription_provider_userId_externalProductId_key" ON "ExternalSubscription"("provider", "userId", "externalProductId");

-- CreateIndex
CREATE INDEX "ExternalAccessGrant_userId_courseId_status_expiresAt_idx" ON "ExternalAccessGrant"("userId", "courseId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ExternalAccessGrant_externalProductId_status_idx" ON "ExternalAccessGrant"("externalProductId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccessGrant_provider_userId_courseId_externalProduc_key" ON "ExternalAccessGrant"("provider", "userId", "courseId", "externalProductId");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_eventType_receivedAt_idx" ON "WebhookEvent"("provider", "eventType", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventKey_key" ON "WebhookEvent"("provider", "eventKey");

-- CreateIndex
CREATE INDEX "IntegrationLog_provider_createdAt_idx" ON "IntegrationLog"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "_CategoryToCourse_B_index" ON "_CategoryToCourse"("B");

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_videoResourceId_fkey" FOREIGN KEY ("videoResourceId") REFERENCES "VideoAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPathCourse" ADD CONSTRAINT "LearningPathCourse_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPathCourse" ADD CONSTRAINT "LearningPathCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonChapter" ADD CONSTRAINT "LessonChapter_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonMaterial" ADD CONSTRAINT "LessonMaterial_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonTranscript" ADD CONSTRAINT "LessonTranscript_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCourse" ADD CONSTRAINT "ProductCourse_externalProductId_fkey" FOREIGN KEY ("externalProductId") REFERENCES "ExternalProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCourse" ADD CONSTRAINT "ProductCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCustomer" ADD CONSTRAINT "ExternalCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSubscription" ADD CONSTRAINT "ExternalSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSubscription" ADD CONSTRAINT "ExternalSubscription_externalProductId_fkey" FOREIGN KEY ("externalProductId") REFERENCES "ExternalProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAccessGrant" ADD CONSTRAINT "ExternalAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAccessGrant" ADD CONSTRAINT "ExternalAccessGrant_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAccessGrant" ADD CONSTRAINT "ExternalAccessGrant_externalProductId_fkey" FOREIGN KEY ("externalProductId") REFERENCES "ExternalProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToCourse" ADD CONSTRAINT "_CategoryToCourse_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToCourse" ADD CONSTRAINT "_CategoryToCourse_B_fkey" FOREIGN KEY ("B") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
