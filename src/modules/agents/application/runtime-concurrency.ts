import type { Prisma } from "@prisma/client";
import { runtimeFingerprint, supportsDualConcurrency } from "@/modules/agents/domain/capacity";
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

/**
 * Lease ve scheduler için TEK etkin eşzamanlılık otoritesi (F02).
 *
 * Önceden lease (`leaseRuntimeRun`) ve scheduler (`runStochasticSchedulerTick`)
 * doğrudan `settings.codexConcurrency === 2 ? 2 : 1` kullanıyordu; yani istenen
 * ayar, kapasite/yetenek ölçümünün hâlâ geçerli olduğunu söyleyen kanıttan
 * BAĞIMSIZ uygulanıyordu. Sağlayıcı, binary, makine koşulu ya da prompt profili
 * değişip ölçüm eskiyince, geçmişte alınmış "concurrency 2 güvenli" izni
 * taşınmaya devam ediyordu. Bu "sınırsız iş koşuyor" değildi (ayar + kilitler
 * sınırı tutuyor), eksik olan güncel kanıtın etkin sınıra yansımasıydı.
 *
 * Artık üç yol da aynı `supportsDualConcurrency` predicate'ini kullanıyor:
 *   - kontrol düzlemi set-kapısı (`assertDualConcurrencySupported`, ayar yazılırken),
 *   - manuel toplu koşu (`calculateRuntimeCapacity(...).effectiveConcurrency`),
 *   - ve buradan lease + scheduler.
 *
 * **Davranış açıkça tanımlı:**
 *   - Kapasite kaydı HİÇ yoksa ayar korunur (düşürülmez). Set-kapısı
 *     (`assertDualConcurrencySupported`) zaten kanıtsız concurrency 2 yazılmasını
 *     engelliyor; yani üretimde "concurrency 2 ama kayıt yok" durumu oluşamaz.
 *     Yoktan yere düşürmek yerine ayara güvenilir (mevcut davranış korunur).
 *   - Kayıt VAR ama **eskimişse** (staleAt geçmiş), **major codex sürümü** ya da
 *     **prompt profili hash'i** eşleşmiyorsa, ya da güncel codex sürümü koşu
 *     parmak izinden okunamıyorsa `supportsDualConcurrency` false döner ve etkin
 *     eşzamanlılık **1'e düşer**. F02'nin kapattığı asıl açık budur: eskiyen kanıt
 *     artık etkin sınıra yansıyor. Concurrency 2'ye dönmek yeni benchmark ister.
 *
 * DAĞITIM SONUCU (Astra hakem turu + Gökhan kararı gerekir): Bu değişiklik
 * canlı davranışı değiştirebilir — üretim kapasite kaydının prompt profili
 * hash'i güncel değilse dağıtımdan sonra etkin eşzamanlılık 2'den 1'e düşer.
 * Dağıtımdan önce taze benchmark koşulup kaydın güncel olduğu doğrulanmalı.
 */
export async function resolveEffectiveRuntimeConcurrency(
  transaction: Prisma.TransactionClient,
  input: { configuredConcurrency: number; now: Date },
  dependencies: EffectiveRuntimeConcurrencyDependencies = defaultDependencies,
): Promise<1 | 2> {
  const configured = input.configuredConcurrency === 2 ? 2 : 1;
  // Konfigüre sınır 1 ise kanıta bakmaya gerek yok; asıl kapı 2 içindir.
  if (configured !== 2) return 1;
  const capability = await dependencies.getLatestRuntimeCapability(transaction);
  // Kanıt kaydı HİÇ yoksa ayarı koru: set-kapısı zaten kanıtsız 2 yazılmasını
  // engelliyor, dolayısıyla bu durum üretimde oluşmaz; yoktan yere düşürme.
  if (!capability) return 2;
  const fingerprintRecord = await dependencies.getLatestRuntimeFingerprintRecord(transaction);
  const fingerprint = runtimeFingerprint(fingerprintRecord?.usageMetadata);
  const dualSupported = supportsDualConcurrency(capability, {
    now: input.now,
    ...(fingerprint.codexVersion !== undefined ? { codexVersion: fingerprint.codexVersion } : {}),
    promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
  });
  return dualSupported ? 2 : 1;
}
