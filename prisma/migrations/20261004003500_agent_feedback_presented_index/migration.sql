-- Geri alınan kartın daha önce gerçekten sunulduğu, profil/tür/zaman aralığında aranır.
CREATE INDEX "agent_runtime_events_feedback_presented_idx"
ON "agent_runtime_events" ("agentProfileId", "eventType", "occurredAt");
