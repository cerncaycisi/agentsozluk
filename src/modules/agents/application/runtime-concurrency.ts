import type { TransactionClient } from "@/lib/db/types";
import type { CapabilityStaleReason } from "@/modules/agents/domain/capacity";
import {
  capabilityFreshness,
  runtimeFingerprint,
  supportsDualConcurrency,
} from "@/modules/agents/domain/capacity";
import {
  getLatestRuntimeCapability,
  getLatestRuntimeFingerprintRecord,
} from "@/modules/agents/repository/capacity";
import {
  appendRuntimeEvent,
  getLatestRuntimeConcurrencyDecisionEvent,
  RUNTIME_CONCURRENCY_DECISION_EVENT_TYPE,
} from "@/modules/agents/repository/control-plane";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

export interface EffectiveRuntimeConcurrencyDependencies {
  getLatestRuntimeCapability: typeof getLatestRuntimeCapability;
  getLatestRuntimeFingerprintRecord: typeof getLatestRuntimeFingerprintRecord;
}

const defaultDependencies: EffectiveRuntimeConcurrencyDependencies = {
  getLatestRuntimeCapability,
  getLatestRuntimeFingerprintRecord,
};

export interface ConcurrencyDecisionRecordDependencies {
  getLatestRuntimeConcurrencyDecisionEvent: typeof getLatestRuntimeConcurrencyDecisionEvent;
  appendRuntimeEvent: typeof appendRuntimeEvent;
}

const defaultRecordDependencies: ConcurrencyDecisionRecordDependencies = {
  getLatestRuntimeConcurrencyDecisionEvent,
  appendRuntimeEvent,
};

/** Kararı hangi yolun uyguladığı; kaydın "kim kıstı" sorusuna cevabı. */
export type ConcurrencyDecisionCallPath = "LEASE" | "STOCHASTIC_SCHEDULER";

export type EffectiveConcurrencyReason =
  | "CONFIGURED_SINGLE"
  | "EVIDENCE_FRESH"
  | "BENCHMARK_MISSING"
  | "CODEX_VERSION_UNKNOWN"
  | "DUAL_CONCURRENCY_UNSUPPORTED"
  | "EVIDENCE_STALE";

export interface EffectiveRuntimeConcurrency {
  /** Lease ve scheduler'ın uygulayacağı sınır. */
  concurrency: 1 | 2;
  /** Operatörün ayarladığı sınır; düşüş bununla karşılaştırılarak görünür olur. */
  configuredConcurrency: 1 | 2;
  reason: EffectiveConcurrencyReason;
  /** Kararın dayandığı ölçümün kimliği; yoksa kanıt da yoktur. */
  measurementId: string | null;
  staleAt: Date | null;
  staleReasons: CapabilityStaleReason[];
}

/**
 * Lease ve scheduler için TEK etkin eşzamanlılık otoritesi (F02).
 *
 * Önceden lease (`leaseRuntimeRun`) ve scheduler (`runStochasticSchedulerTick`)
 * doğrudan `settings.codexConcurrency === 2 ? 2 : 1` kullanıyordu: istenen ayar,
 * ölçümün hâlâ geçerli olduğunu söyleyen kanıttan bağımsız uygulanıyordu.
 * Sağlayıcı, binary, makine koşulu ya da prompt profili değişip ölçüm eskiyince
 * geçmişte alınmış "concurrency 2 güvenli" izni taşınmaya devam ediyordu.
 *
 * Artık üç yol da aynı `supportsDualConcurrency` predicate'ini kullanıyor:
 * kontrol düzlemi set-kapısı, `calculateRuntimeCapacity` durum görünümü ve buradan
 * lease + scheduler.
 *
 * **KAPSAM (dar tutuluyor):** bu modül "mevcut kapasite politikasını lease ve
 * scheduler'a da uygular". "Çalışan binary için geçerli kanıt olmadan asla 2
 * verilmez" güvencesini VERMEZ: sürüm okuması geçmiş bir kayda dayanabilir ve
 * `codexVersion` yokken `model` alanına düşebilir. O açık `domain/capacity.ts`
 * üzerinde, ölçümle birlikte ayrıca kapatılmalıdır (Astra, 14 Eylül).
 *
 * **Kanıt yoksa sınır 1.** Bu, `calculateRuntimeCapacity` ile aynı sonuçtur:
 * `supportsDualConcurrency(null, …)` zaten false döner. Önceki aday burada
 * "kayıt yoksa ayarı koru" diye erken dönüyordu; o dönüş predicate'i baypas edip
 * kanıtsız 2'ye izin veriyor ve birleştirmeyi amaçladığı üç yolu tam bu noktada
 * çelişkiye düşürüyordu (Astra hakem turu, 14 Eylül).
 *
 * **Sürüm okuması görünümle aynıdır.** `runtimeFingerprint` kullanılır; sürüm hiç
 * okunamıyorsa sınır 1 olur. Bu okumanın `codexVersion` yokken `usageMetadata.model`
 * alanına düşmesi devralınan bir zayıflıktır (`gpt-5` Codex CLI major sürümünü
 * kanıtlamaz, Astra 14 Eylül). Burada farklı davranmak iki yolu ayrıştırır; zayıflık
 * `domain/capacity.ts` içinde, ölçümle birlikte ayrıca ele alınmalıdır.
 *
 * DAĞITIM: prompt profili hash'i değişen her dağıtım bu kararı etkiler. Yeni
 * hash'le eşleşen taze bir kapasite ölçümü yoksa etkin sınır 2'den 1'e düşer.
 */
export async function resolveEffectiveRuntimeConcurrency(
  transaction: TransactionClient,
  input: { configuredConcurrency: number; now: Date },
  dependencies: EffectiveRuntimeConcurrencyDependencies = defaultDependencies,
): Promise<EffectiveRuntimeConcurrency> {
  const configuredConcurrency: 1 | 2 = input.configuredConcurrency === 2 ? 2 : 1;
  const base = {
    configuredConcurrency,
    measurementId: null,
    staleAt: null,
    staleReasons: [] as CapabilityStaleReason[],
  };
  // Ayar 1 ise kanıta bakmaya gerek yok; kapı yalnız 2 içindir.
  if (configuredConcurrency === 1) return { concurrency: 1, reason: "CONFIGURED_SINGLE", ...base };

  const capability = await dependencies.getLatestRuntimeCapability(transaction);
  if (!capability) return { concurrency: 1, reason: "BENCHMARK_MISSING", ...base };

  const fingerprintRecord = await dependencies.getLatestRuntimeFingerprintRecord(transaction);
  // Görünümle (`application/capacity.ts` → `calculateRuntimeCapacity`) AYNI fingerprint
  // okuması: iki yol ayrışırsa F02'nin "tek otorite" amacı bozulur. Bu okumanın
  // `codexVersion` yokken `model` alanına düşmesi ayrı ve devralınan bir zayıflıktır;
  // burada sessizce farklı davranmak yerine tek yerde ele alınmalıdır.
  const { codexVersion } = runtimeFingerprint(fingerprintRecord?.usageMetadata);
  const measured = { measurementId: capability.id, staleAt: capability.staleAt };
  if (codexVersion === undefined)
    return {
      concurrency: 1,
      reason: "CODEX_VERSION_UNKNOWN",
      configuredConcurrency,
      staleReasons: [],
      ...measured,
    };

  const freshnessInput = {
    now: input.now,
    codexVersion,
    promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
  };
  if (!supportsDualConcurrency(capability, freshnessInput)) {
    /*
      Ret nedenini ayır: taze ama "çift eşzamanlılık güvenli değil" diyen bir ölçüm
      ESKİ DEĞİLDİR. İkisini aynı adla raporlamak yanlış teşhistir — operatör boşuna
      yeniden benchmark alır (Astra, 14 Eylül).
    */
    const { staleReasons } = capabilityFreshness(capability, freshnessInput);
    return {
      concurrency: 1,
      reason: staleReasons.length > 0 ? "EVIDENCE_STALE" : "DUAL_CONCURRENCY_UNSUPPORTED",
      configuredConcurrency,
      staleReasons,
      ...measured,
    };
  }
  return {
    concurrency: 2,
    reason: "EVIDENCE_FRESH",
    configuredConcurrency,
    staleReasons: [],
    ...measured,
  };
}

const reasonMessages: Record<EffectiveConcurrencyReason, string> = {
  CONFIGURED_SINGLE: "operatör ayarı zaten tek şerit",
  EVIDENCE_FRESH: "ölçüm taze ve çift şeridi destekliyor",
  BENCHMARK_MISSING: "hiç kapasite ölçümü yok",
  CODEX_VERSION_UNKNOWN: "çalışan Codex sürümü okunamadı",
  DUAL_CONCURRENCY_UNSUPPORTED: "ölçüm taze ama çift şeridi güvenli bulmadı",
  EVIDENCE_STALE: "ölçüm eskidi",
};

/** Kararın kimliği. Değişmediyse kayıt tekrarlanmaz. */
function decisionFingerprint(decision: EffectiveRuntimeConcurrency): string {
  return [
    decision.concurrency,
    decision.configuredConcurrency,
    decision.reason,
    decision.measurementId ?? "-",
    decision.staleAt?.toISOString() ?? "-",
    [...decision.staleReasons].sort().join("+") || "-",
  ].join("|");
}

/**
 * Uygulanan eşzamanlılık kararını operatöre görünür kıl (F02 / P2).
 *
 * `resolveEffectiveRuntimeConcurrency` istenen sınırı sessizce düşürebiliyor.
 * Düşüşün kendisi doğru; görünmez olması değil. Birim testin karar nesnesinde
 * nedeni görmesi, operatörün görebildiğini kanıtlamaz (Astra, 14 Eylül).
 *
 * Üç kısıt bilinçli:
 *
 * 1. **Her tick'te yazılmaz.** Kayıt yalnız parmak izi değişince eklenir; aksi
 *    halde sabit bir durum dakikada bir satırla olay akışını boğar ve gerçek
 *    geçişi görünmez kılar.
 * 2. **Geri alınan transaction uygulanmış karar gibi görünmez.** Kayıt, kararı
 *    uygulayan transaction'ın İÇİNDE yazılır; lease ya da tick geri alınırsa
 *    kayıt da geri alınır.
 * 3. **Worker sözleşmesine taşınmaz.** Yeni bir `skipReason` alanı yok; bu
 *    sunucu tarafı bir gözlem kaydıdır.
 *
 * Oku-karşılaştır-yaz yarışı yok: her iki çağıran da bu noktadan önce
 * `lockAgentSettings` ile ayar satırını kilitliyor (`runtime.ts:1363`,
 * `stochastic-scheduler.ts:51`), dolayısıyla iki yol aynı anda kayıt üretemez.
 */
export async function recordEffectiveConcurrencyDecision(
  transaction: TransactionClient,
  decision: EffectiveRuntimeConcurrency,
  input: { callPath: ConcurrencyDecisionCallPath; now: Date },
  dependencies: ConcurrencyDecisionRecordDependencies = defaultRecordDependencies,
): Promise<{ recorded: boolean; fingerprint: string }> {
  const fingerprint = decisionFingerprint(decision);
  const previous = await dependencies.getLatestRuntimeConcurrencyDecisionEvent(transaction);
  const previousMetadata =
    previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata)
      ? (previous.metadata as Record<string, unknown>)
      : null;
  if (previousMetadata?.fingerprint === fingerprint) return { recorded: false, fingerprint };

  const previousConcurrency =
    typeof previousMetadata?.effectiveConcurrency === "number"
      ? previousMetadata.effectiveConcurrency
      : null;
  const transition =
    previousConcurrency === null
      ? `Etkin eşzamanlılık sınırı ${decision.concurrency}`
      : `Etkin eşzamanlılık sınırı ${previousConcurrency} → ${decision.concurrency}`;
  await dependencies.appendRuntimeEvent(transaction, {
    eventType: RUNTIME_CONCURRENCY_DECISION_EVENT_TYPE,
    safeMessage: `${transition} (ayar ${decision.configuredConcurrency}): ${reasonMessages[decision.reason]}.`,
    metadata: {
      fingerprint,
      callPath: input.callPath,
      configuredConcurrency: decision.configuredConcurrency,
      effectiveConcurrency: decision.concurrency,
      previousEffectiveConcurrency: previousConcurrency,
      reason: decision.reason,
      measurementId: decision.measurementId,
      staleAt: decision.staleAt?.toISOString() ?? null,
      staleReasons: decision.staleReasons,
      promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
    },
    occurredAt: input.now,
  });
  return { recorded: true, fingerprint };
}
