-- Índices para os caminhos críticos de catálogo, biblioteca, sessão e administração.
CREATE INDEX "User_role_status_createdAt_idx" ON "User"("role", "status", "createdAt");
CREATE INDEX "Course_status_featured_publishedAt_createdAt_idx" ON "Course"("status", "featured", "publishedAt", "createdAt");
CREATE INDEX "Lesson_moduleId_published_position_idx" ON "Lesson"("moduleId", "published", "position");
CREATE INDEX "Enrollment_userId_status_updatedAt_idx" ON "Enrollment"("userId", "status", "updatedAt");
CREATE INDEX "LessonProgress_userId_updatedAt_idx" ON "LessonProgress"("userId", "updatedAt");
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");
CREATE INDEX "LearningPath_published_position_createdAt_idx" ON "LearningPath"("published", "position", "createdAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
