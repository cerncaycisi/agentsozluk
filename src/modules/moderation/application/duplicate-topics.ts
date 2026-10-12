import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { createReport } from "@/modules/moderation/application/reports";
import { findModerationActor } from "@/modules/moderation/repository/actions";
import { appendAuditLog } from "@/modules/audit";
import { appendModerationAction } from "@/modules/moderation/repository/history";
import { appendOutboxEvent } from "@/modules/outbox";
import { reportCreateSchema } from "@/modules/moderation/validation/schemas";
import { resolveCanonicalTopicProposal } from "@/modules/topics/application/topics";
import { randomUUID } from "node:crypto";
import { getEnvironment } from "@/config/env";
import { KARAGOZ } from "@/modules/moderation/domain/karagoz";
import {
  createKaragozUser,
  findKaragozUser,
  findTopicMergeTarget,
  grantKaragozGammaz,
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
// Günlük çalışır (Gökhan: "günlük baksın ispiyonlasın"); 3 günlük pencere atlanan bir günü örter.
export const DUPLICATE_SCAN_DEFAULTS = { days: 3, threshold: 0.8, limit: 30 } as const;

export function duplicateReportPlan(pair: DuplicateTopicPair) {
  /*
    Korunan seed entry içeren başlık birleştirilemez (mergeTopic ENTRY_NOT_EDITABLE); kaynak
    olamaz, kanonik olur (Sol, 12 Ekim). İkisinde de seed varsa çift taramada elenir.
  */
  const newerIsCanonical = pair.newerHasSeed
    ? true
    : pair.olderHasSeed
      ? false
      : pair.newerEntryCount > pair.olderEntryCount;
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
      reporterUsername: KARAGOZ.username,
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
  const karagozId = await inTransaction(client, async (transaction) => {
    // Operatörün güncel durumu kilitlenip yeniden okunur; eski ADMIN bağlamına güvenilmez (Sol, 12 Ekim).
    const principal = await findModerationActor(transaction, operator.actorId);
    if (
      !principal ||
      principal.kind !== "HUMAN" ||
      principal.role !== "ADMIN" ||
      principal.status !== "ACTIVE"
    )
      throw new AppError("FORBIDDEN", 403, "Karagözü yalnız aktif yönetici kurabilir.");
    const existing = await findKaragozUser(transaction, KARAGOZ.username);
    // Var olan hesap önce denetlenir; beklenen karagöz değilse hiçbir şey yazılmaz.
    if (existing && !isValidKaragoz(existing, { requireCapability: false }))
      throw new AppError("FORBIDDEN", 403, "Karagöz kullanıcı adı başka bir hesaba ait.");
    const userId =
      existing?.id ??
      (
        await createKaragozUser(transaction, {
          ...KARAGOZ,
          termsVersion: getEnvironment().TERMS_VERSION,
        })
      ).id;
    if (!existing || existing.moderationCapabilities.length === 0) {
      const record = await grantKaragozGammaz(transaction, {
        userId,
        grantedById: operator.actorId,
      });
      // Normal yetenek verme akışıyla aynı denetim izi (Sol, 12 Ekim).
      const reason = "Karagöz kurulumu: kopya başlık gammazı için GAMMAZ yeteneği.";
      await appendModerationAction(transaction, {
        moderatorId: operator.actorId,
        actionType: "CAPABILITY_GRANTED",
        targetType: "USER",
        targetId: userId,
        reason,
        metadata: {
          actorKind: operator.actorKind,
          capability: "GAMMAZ",
          reason,
          before: { active: false },
          after: { active: true },
        },
      });
      await appendAuditLog(transaction, {
        actorId: operator.actorId,
        action: "user.capability_granted",
        entityType: "UserModerationCapability",
        entityId: record.id,
        requestId: operator.requestId,
        metadata: { capability: "GAMMAZ", targetUserId: userId, active: true },
      });
      await appendOutboxEvent(transaction, {
        eventType: "user.capability_granted",
        aggregateType: "UserModerationCapability",
        aggregateId: record.id,
        actorId: operator.actorId,
        actorKind: operator.actorKind,
        requestId: operator.requestId,
        payload: { capability: "GAMMAZ", targetUserId: userId, active: true },
      });
    }
    return userId;
  });
  return karagozActor(karagozId);
}

function isValidKaragoz(
  user: NonNullable<Awaited<ReturnType<typeof findKaragozUser>>>,
  options: { requireCapability: boolean },
) {
  return (
    user.kind === "AGENT" &&
    user.status === "ACTIVE" &&
    user.loginDisabled &&
    !user.writerApproved &&
    user.agentProfile === null &&
    (!options.requireCapability || user.moderationCapabilities.length > 0)
  );
}

function karagozActor(actorId: string): ActorContext {
  return {
    actorId,
    actorKind: "AGENT",
    actorRole: "USER",
    requestId: randomUUID(),
    origin: "AGENT",
  };
}

/*
  Günlük çalışma yönetici kimliği istemez: kurulu karagöz hesabı aranır ve beklenen durumdaysa
  gammaz onunla açılır. Hesap yoksa ya da bozulduysa çalışma durur; kurulum `ensureKaragoz`.
*/
export async function resolveKaragozActor(client: DatabaseExecutor): Promise<ActorContext> {
  const karagoz = await inTransaction(client, (transaction) =>
    findKaragozUser(transaction, KARAGOZ.username),
  );
  if (!karagoz || !isValidKaragoz(karagoz, { requireCapability: true }))
    throw new AppError(
      "FORBIDDEN",
      403,
      "Karagöz hesabı kurulu değil ya da beklenen durumda değil.",
    );
  return karagozActor(karagoz.id);
}

export async function fileDuplicateTopicReports(
  client: DatabaseExecutor,
  actor: ActorContext,
  pairs: DuplicateTopicPair[],
) {
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
      /*
        Kaynak başlığın zaten açık bir karagöz raporu varsa (A→B bekliyor) A→C kaybolmasın:
        aynı çift ters yönde (C→A) raporlanır. İkisinin de açık raporu varsa sonraki taramada
        yeniden denenir (Astra, 12 Ekim, 2. tur).
      */
      const flipped =
        error instanceof AppError && error.code === "REPORT_ALREADY_OPEN"
          ? await fileFlipped(client, actor, pair, plan)
          : null;
      if (flipped) filed.push(flipped);
      else
        failed.push({
          sourceTitle: plan.sourceTitle,
          code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
        });
    }
  }
  return { filed, failed };
}

async function fileFlipped(
  client: DatabaseExecutor,
  actor: ActorContext,
  pair: DuplicateTopicPair,
  plan: ReturnType<typeof duplicateReportPlan>,
) {
  // Ters yönün kaynağı seed taşıyorsa birleştirilemez; ters rapor açılmaz.
  if (plan.sourceId === pair.newerId ? pair.olderHasSeed : pair.newerHasSeed) return null;
  const other =
    plan.sourceId === pair.newerId
      ? { sourceId: pair.olderId, sourceTitle: pair.olderTitle, canonicalTitle: pair.newerTitle }
      : { sourceId: pair.newerId, sourceTitle: pair.newerTitle, canonicalTitle: pair.olderTitle };
  const input = reportCreateSchema.safeParse({
    targetType: "TOPIC",
    targetId: other.sourceId,
    reason: "TOPIC_CANONICALIZATION_REQUEST",
    evidence: { suggestedTitle: other.canonicalTitle },
    details: `karagöz: başlık benzerliği ${pair.similarity.toFixed(2).replace(".", ",")}.`,
  });
  if (!input.success) return null;
  try {
    const report = await createReport(client, actor, input.data);
    return { reportId: report.id, ...other };
  } catch {
    return null;
  }
}

/*
  Kopya raporundaki önerilen başlığı aktif bir başlığa çözer. Önerilen başlık sonradan başka bir
  başlığa birleştiyse birleştiği başlık döner (en çok 5 adım); aktif değilse null (Sol, 12 Ekim).
*/
export async function resolveSuggestedCanonicalTopic(client: DatabaseExecutor, title: string) {
  const match = await resolveCanonicalTopicProposal(client, title);
  if (!match) return null;
  return inTransaction(client, async (transaction) => {
    let topic = await findTopicMergeTarget(transaction, match.topic.id);
    for (
      let step = 0;
      topic && topic.status === "MERGED" && topic.mergedIntoId && step < 5;
      step += 1
    )
      topic = await findTopicMergeTarget(transaction, topic.mergedIntoId);
    return topic && topic.status === "ACTIVE"
      ? { id: topic.id, title: topic.title, publicId: Number(topic.publicId), slug: topic.slug }
      : null;
  });
}
