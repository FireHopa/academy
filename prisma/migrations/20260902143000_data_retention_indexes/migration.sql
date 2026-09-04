-- Índices usados pelo job de retenção para evitar varreduras completas.
CREATE INDEX "AccountToken_expiresAt_idx" ON "AccountToken"("expiresAt");
CREATE INDEX "AccountToken_usedAt_idx" ON "AccountToken"("usedAt");
CREATE INDEX "Notification_readAt_createdAt_idx" ON "Notification"("readAt", "createdAt");
CREATE INDEX "WatchSession_status_endedAt_idx" ON "WatchSession"("status", "endedAt");
CREATE INDEX "WatchSession_status_lastSeenAt_idx" ON "WatchSession"("status", "lastSeenAt");
CREATE INDEX "ExternalCustomer_updatedAt_idx" ON "ExternalCustomer"("updatedAt");
CREATE INDEX "ExternalSubscription_updatedAt_idx" ON "ExternalSubscription"("updatedAt");
CREATE INDEX "WebhookEvent_status_processedAt_idx" ON "WebhookEvent"("status", "processedAt");
CREATE INDEX "IntegrationLog_createdAt_idx" ON "IntegrationLog"("createdAt");
