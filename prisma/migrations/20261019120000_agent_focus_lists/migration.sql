-- Süreli odak listesi (Gökhan kararı, 19 Ekim 2026: odaklı içerik denemesi "erken başla").
-- Yalnız ek yapar: yeni tablo ve yeni tablonun indeksi. Yabancı anahtar yok; mevcut tabloya
-- dokunmaz, eski imaj tabloyu hiç okumaz. Kimlik istemci tarafında üretilir; kimlik dizileri
-- JSONB tutulur.

-- CreateTable
CREATE TABLE "agent_focus_lists" (
    "id" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "topicIds" JSONB NOT NULL,
    "agentProfileIds" JSONB NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "endedById" UUID,
    "endReason" VARCHAR(1000),

    CONSTRAINT "agent_focus_lists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_focus_lists_endsAt_idx" ON "agent_focus_lists"("endsAt");
