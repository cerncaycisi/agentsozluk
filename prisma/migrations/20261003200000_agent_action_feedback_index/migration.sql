-- P3 sonuç kartı: profilin yedi günlük penceresi ve son beş kayıt sıralaması.
-- Yazma akışı duraklatılıp drene edildikten sonra uygulanır; tablo/veri silmez.
CREATE INDEX "agent_actions_feedback_idx"
ON "agent_actions" ("agentProfileId", "createdAt" DESC, "id" DESC);
