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
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

export interface EffectiveRuntimeConcurrencyDependencies {
  getLatestRuntimeCapability: typeof getLatestRuntimeCapability;
  getLatestRuntimeFingerprintRecord: typeof getLatestRuntimeFingerprintRecord;
}

const defaultDependencies: EffectiveRuntimeConcurrencyDependencies = {
  getLatestRuntimeCapability,
  getLatestRuntimeFingerprintRecord,
};

export type EffectiveConcurrencyReason =
  | "CONFIGURED_SINGLE"
  | "EVIDENCE_FRESH"
  | "BENCHMARK_MISSING"
  | "CODEX_VERSION_UNKNOWN"
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
  if (!supportsDualConcurrency(capability, freshnessInput))
    return {
      concurrency: 1,
      reason: "EVIDENCE_STALE",
      configuredConcurrency,
      staleReasons: capabilityFreshness(capability, freshnessInput).staleReasons,
      ...measured,
    };
  return {
    concurrency: 2,
    reason: "EVIDENCE_FRESH",
    configuredConcurrency,
    staleReasons: [],
    ...measured,
  };
}
