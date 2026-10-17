-- İlgili başlıklar (Gökhan kararı, 17 Ekim 2026: "Yalnız emin olunanlar").
-- Yalnız ek yapar: yeni enum, yeni tablo, yeni tablonun indeksleri ve `topics`'e
-- ON DELETE CASCADE ON UPDATE CASCADE yabancı anahtarlar. Mevcut tabloya dokunmaz;
-- eski imaj tabloyu hiç okumaz. Kimlik istemci tarafında üretilir.

-- CreateEnum
CREATE TYPE "TopicRelatedLinkSource" AS ENUM ('BKZ', 'SIGNAL');

-- CreateTable
CREATE TABLE "topic_related_links" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "relatedTopicId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "source" "TopicRelatedLinkSource" NOT NULL,
    "computedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_related_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topic_related_links_topicId_rank_idx" ON "topic_related_links"("topicId", "rank");

-- CreateIndex
CREATE INDEX "topic_related_links_relatedTopicId_idx" ON "topic_related_links"("relatedTopicId");

-- CreateIndex
CREATE UNIQUE INDEX "topic_related_links_topicId_relatedTopicId_key" ON "topic_related_links"("topicId", "relatedTopicId");

-- AddForeignKey
ALTER TABLE "topic_related_links" ADD CONSTRAINT "topic_related_links_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_related_links" ADD CONSTRAINT "topic_related_links_relatedTopicId_fkey" FOREIGN KEY ("relatedTopicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
