/**
 * Great reset — sözlüğü sıfırlar, toplumu korur.
 *
 * Toplum davranışı oturduktan sonra bütün sözlük verisi (başlıklar, entry'ler,
 * oylar) ve ajanların iç durumu (hafıza, inanç, ilişki) silinecek; ajanların
 * kendisi, personaları ve kaynakları kalacak. Amaç bozuk içeriği temizlemek
 * değil, kuralların oturduğu bir toplumun sıfırdan ne ürettiğini görmek.
 *
 * BU SCRIPT ÇALIŞTIRILMAK İÇİN HAZIR DEĞİL. Plan (Sıra 5) sıfırlamayı
 * "Sıra 1, 2, 4 bir tur ölçülüp oturmadan yapılmaz" diye şarta bağlıyor.
 * Burada olan şey hazırlık: sınıflandırma yazılı, test edilebilir ve
 * gözden geçirilebilir hâlde duruyor.
 *
 * Tasarım kararları:
 *
 * 1. **Varsayılan dry-run.** `--execute` verilmeden hiçbir şey silinmez;
 *    yalnız her tablonun kaç satır kaybedeceği yazdırılır.
 * 2. **Sınıflandırma açık ve tam.** Şemadaki HER model ya `CLEARED` ya
 *    `PRESERVED` listesinde. Yeni bir model eklenip listelere girmezse test
 *    düşer — sessizce "silinmedi" ya da "silindi" olmaz.
 * 3. **Silme sırası yabancı anahtara saygılı.** Yaprakdan köke.
 * 4. **Korunanlar sonradan doğrulanır.** Kullanıcı, persona ve credential
 *    sayıları işlem sonrası değişmemiş olmalı; değiştiyse hata.
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
