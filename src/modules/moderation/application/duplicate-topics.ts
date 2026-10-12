import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { createReport } from "@/modules/moderation/application/reports";
import { reportCreateSchema } from "@/modules/moderation/validation/schemas";
import { randomUUID } from "node:crypto";
import { getEnvironment } from "@/config/env";
import { KARAGOZ } from "@/modules/moderation/domain/karagoz";
import {
  ensureKaragozUser,
  findDuplicateTopicPairs,
  type DuplicateTopicPair,
} from "@/modules/moderation/repository/duplicate-topics";

/*
  KARAGÖZ — kopya başlık taraması (Gökhan, 12 Ekim 2026: "bir agent yaz, o tarasın server'da. sonra gammazlasın").

  Yeni açılan başlıklardan eski bir başlığa çok benzeyenler için "kopya başlık" gammazı açılır.
  Karar ve birleştirme insanda kalır: rapor sayfasında tek tıkla birleştir ya da "aynı değil".
  Hiçbir başlık otomatik birleştirilmez. Etiketli 991 çiftte benzerlik ≥0,8 iken çiftlerin
  yaklaşık %60'ı gerçekten aynı kavramdı; geri kalanı insan kararı gerektirir.

  Kanonik başlık: daha çok entry'si olan; eşitse daha önce açılan. Gammaz kanonik olmayana açılır
  ve `suggestedTitle` kanonik başlığın adıdır; rapor sayfası adı başlığa çözer.
*/
export const DUPLICATE_SCAN_DEFAULTS = { days: 8, threshold: 0.8, limit: 30 } as const;

export function duplicateReportPlan(pair: DuplicateTopicPair) {
  const newerIsCanonical = pair.newerEntryCount > pair.olderEntryCount;
  return newerIsCanonical
    ? { sourceId: pair.olderId, sourceTitle: pair.olderTitle, canonicalTitle: pair.newerTitle }
    : { sourceId: pair.newerId, sourceTitle: pair.newerTitle, canonicalTitle: pair.olderTitle };
}

export async function scanDuplicateTopics(
  client: DatabaseExecutor,
  input: { now: Date; days?: number; threshold?: number; limit?: number },
) {
  const days = input.days ?? DUPLICATE_SCAN_DEFAULTS.days;
  const threshold = input.threshold ?? DUPLICATE_SCAN_DEFAULTS.threshold;
  const limit = input.limit ?? DUPLICATE_SCAN_DEFAULTS.limit;
  if (
    !(threshold >= 0.5 && threshold <= 1) ||
    !(days >= 1 && days <= 60) ||
    !(limit >= 1 && limit <= 100)
  )
    throw new AppError("VALIDATION_ERROR", 422, "Kopya taraması ayarı geçersiz.");
  return inTransaction(client, (transaction) =>
    findDuplicateTopicPairs(transaction, {
      since: new Date(input.now.getTime() - days * 86_400_000),
      threshold,
      limit,
    }),
  );
}

/*
  Gammazı operatör değil karagöz hesabı açar (Gökhan, 12 Ekim). Operatör yalnız hesabı
  ilk kez açarken GAMMAZ yeteneğini veren kişi olarak kaydedilir; bunun için aktif ADMIN olmalı.
*/
export async function ensureKaragoz(client: DatabaseExecutor, operator: ActorContext) {
  if (operator.actorKind !== "HUMAN" || operator.actorRole !== "ADMIN")
    throw new AppError("FORBIDDEN", 403, "Karagözü yalnız yönetici kurabilir.");
  const watcher = await inTransaction(client, (transaction) =>
    ensureKaragozUser(transaction, {
      ...KARAGOZ,
      grantedById: operator.actorId,
      termsVersion: getEnvironment().TERMS_VERSION,
    }),
  );
  if (
    watcher.kind !== "AGENT" ||
    watcher.status !== "ACTIVE" ||
    !watcher.loginDisabled ||
    watcher.writerApproved
  )
    throw new AppError("FORBIDDEN", 403, "Karagöz hesabı beklenen durumda değil.");
  const actor: ActorContext = {
    actorId: watcher.id,
    actorKind: "AGENT",
    actorRole: "USER",
    requestId: randomUUID(),
    origin: "AGENT",
  };
  return actor;
}

export async function fileDuplicateTopicReports(
  client: DatabaseExecutor,
  operator: ActorContext,
  pairs: DuplicateTopicPair[],
) {
  const actor = await ensureKaragoz(client, operator);
  const filed: Array<{ reportId: string; sourceTitle: string; canonicalTitle: string }> = [];
  const failed: Array<{ sourceTitle: string; code: string }> = [];
  for (const pair of pairs) {
    const plan = duplicateReportPlan(pair);
    // Elle açılan gammazla aynı doğrulama: başlık sınırı aşan çift atlanır, tarama düşmez.
    const input = reportCreateSchema.safeParse({
      targetType: "TOPIC",
      targetId: plan.sourceId,
      reason: "TOPIC_CANONICALIZATION_REQUEST",
      evidence: { suggestedTitle: plan.canonicalTitle },
      details: `karagöz: başlık benzerliği ${pair.similarity.toFixed(2).replace(".", ",")}.`,
    });
    if (!input.success) {
      failed.push({ sourceTitle: plan.sourceTitle, code: "VALIDATION_ERROR" });
      continue;
    }
    try {
      const report = await createReport(client, actor, input.data);
      filed.push({ reportId: report.id, ...plan });
    } catch (error) {
      failed.push({
        sourceTitle: plan.sourceTitle,
        code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      });
    }
  }
  return { filed, failed };
}
