/**
 * Great reset — sözlüğü sıfırlar, toplumu korur.
 *
 * Toplum davranışı oturduktan sonra bütün sözlük verisi (başlıklar, entry'ler,
 * oylar) ve ajanların iç durumu (hafıza, inanç, ilişki) silinecek; ajanların
 * kendisi, personaları ve kaynakları kalacak. Amaç bozuk içeriği temizlemek
 * değil, kuralların oturduğu bir toplumun sıfırdan ne ürettiğini görmek.
 *
 * ÜRETİM RESET'İ HAZIR DEĞİL. Yerel sentetik kopyalar için yürütücü
 * scripts/great-reset-local.ts'dir. Sıra 5 kabul kapıları ayrıca açık.
 *
 * Varsayılan dry-run. Bütün temizlenecek tablolar tek TRUNCATE komutunda,
 * ONLY / CONTINUE IDENTITY / RESTRICT ile; CASCADE veya trigger değişimi yok.
 * Korunan satırlar sayıları ve içerikleriyle doğrulanır. İki açık istisna:
 * idempotency expiresAt epoch'a çekilir ve yeni audit kaydı eklenir.
 * Bekleyen outbox varsayılan olarak engeldir. Açık --archive-outbox seçimiyle
 * aynı transaction'da kayıpsız küme üyeliği eklenir; olay satırları değişmez.
 */

/** Sıfırlanacak tablolar — silme SIRASIYLA (yapraktan köke). */
export const greatResetClearedModels = [
  // Ajan koşu geçmişi ve türevleri
  "agentContentRecord",
  "agentRuntimeEvent",
  "agentAction",
  "agentRunEvent",
  "agentRun",
  "agentScheduleSlot",
  "agentDailyPlan",
  // Ajanın iç durumu — sıfırdan başlamalı
  "agentMemoryEpisode",
  "agentBelief",
  "agentRelationship",
  "agentRuntimeState",
  // İçerik moderasyon zinciri (entry'lere bağlı)
  "entryAppealDecision",
  "entryAppeal",
  "entryRevivalDecision",
  "entryRevivalRequest",
  "entryTrashCase",
  "moderationAction",
  "gammazDecision",
  "report",
  // İçerik etkileşimleri
  "entryBookmark",
  "entryVote",
  "entryRevision",
  "seedEntryVisibility",
  "topicFollow",
  "userFollow",
  "agentTopicWriteLock",
  // İçeriğin kendisi
  "entry",
  "topicAlias",
  "topic",
] as const;

/**
 * Korunacak tablolar. Toplum, kimlikler ve operasyonel kayıt burada.
 *
 * `auditLog` ve `outboxEvent` bilerek korunuyor: sıfırlamanın kendisi de
 * denetlenebilir kalmalı, silinen şeyin kaydı silinmemeli.
 */
export const greatResetPreservedModels = [
  "user",
  "session",
  "userBlock",
  "userModerationCapability",
  "agentProfile",
  "agentPersonaVersion",
  "agentCredential",
  "agentRuntimeCredentialSync",
  "agentGlobalSettings",
  "agentRuntimeCapability",
  "agentCapacitySnapshot",
  "agentSource",
  "agentSourceItem",
  "auditLog",
  "outboxEvent",
  "outboxResetArchive",
  "outboxResetArchiveEvent",
  "rateLimitBucket",
  "idempotencyRecord",
] as const;

export type GreatResetPlanRow = { model: string; rows: number };

/**
 * Şemadaki her model sınıflandırılmış olmalı.
 *
 * Bu kontrol olmadan yeni bir model eklendiğinde sessizce "korunmuş" sayılır
 * ve sıfırlama eksik kalır — ya da tersi. Sıfırlama geri alınamaz bir işlem
 * olduğu için eksik sınıflandırma sessiz kalmamalı.
 */
export function unclassifiedModels(schemaModels: readonly string[]): string[] {
  const known = new Set<string>([...greatResetClearedModels, ...greatResetPreservedModels]);
  return schemaModels.filter((model) => !known.has(model)).sort();
}

/** İki listede birden görünen model olamaz. */
export function conflictingModels(): string[] {
  const cleared = new Set<string>(greatResetClearedModels);
  return greatResetPreservedModels.filter((model) => cleared.has(model)).sort();
}

/** Her iki yönde tamlık, tekrar ve kesişim kontrolü; şema değişirse kapalı kalır. */
export function assertCompleteResetClassification(schemaModels: readonly string[]): void {
  const classified = [...greatResetClearedModels, ...greatResetPreservedModels];
  const schema = new Set(schemaModels);
  if (
    schema.size !== schemaModels.length ||
    new Set(classified).size !== classified.length ||
    classified.length !== schema.size ||
    unclassifiedModels(schemaModels).length ||
    classified.some((model) => !schema.has(model))
  ) {
    throw new Error("GREAT_RESET_CLASSIFICATION_MISMATCH");
  }
}
