-- agent_runs.finishedAt indeksi (23 Eylül 2026). Kapasite ölçümünün
-- `busyDurationSorgusu` taraması ön filtreye rağmen sıralıydı; bu indeksle
-- `finishedAt IS NULL OR finishedAt > sınır` koşulu indeksten okunabilir.
-- Yazma dondurulmuşken uygulanır (A5); CONCURRENTLY transaction içinde çalışmaz.
CREATE INDEX "agent_runs_finishedAt_idx" ON "agent_runs"("finishedAt");
