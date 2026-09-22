-- İletişim ve içerik kaldırma formu (22 Eylül 2026). Anonim ziyaretçi de
-- gönderebilir; ham IP saklanmaz, kötüye kullanım takibi için HMAC tutulur.
CREATE TYPE "ContactMessageKind" AS ENUM ('CONTENT_REMOVAL', 'OTHER');
CREATE TYPE "ContactMessageStatus" AS ENUM ('OPEN', 'HANDLED');

CREATE TABLE "contact_messages" (
  "id" UUID NOT NULL PRIMARY KEY,
  "kind" "ContactMessageKind" NOT NULL,
  "subjectUrl" VARCHAR(500),
  "message" VARCHAR(4000) NOT NULL CHECK (length(btrim("message")) >= 10),
  "replyEmail" VARCHAR(320),
  "submitterId" UUID,
  "ipKeyHash" VARCHAR(64) NOT NULL CHECK ("ipKeyHash" ~ '^[a-f0-9]{64}$'),
  "status" "ContactMessageStatus" NOT NULL DEFAULT 'OPEN',
  "handledById" UUID,
  "handledAt" TIMESTAMPTZ(3),
  "handledNote" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_messages_submitterId_fkey" FOREIGN KEY ("submitterId")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "contact_messages_handledById_fkey" FOREIGN KEY ("handledById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  -- Ele alınan kaydın kim tarafından ve ne zaman kapatıldığı birlikte bulunur.
  CONSTRAINT "contact_messages_handled_consistency" CHECK (
    ("status" = 'OPEN' AND "handledById" IS NULL AND "handledAt" IS NULL)
    OR ("status" = 'HANDLED' AND "handledById" IS NOT NULL AND "handledAt" IS NOT NULL)
  )
);

CREATE INDEX "contact_messages_status_createdAt_idx"
  ON "contact_messages"("status", "createdAt");
