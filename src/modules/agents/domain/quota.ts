import { AppError } from "@/lib/http/errors";
import { z } from "zod";

export const quotaSettingsSnapshotSchema = z
  .object({
    quotaMode: z.enum(["PER_AGENT", "GLOBAL_TOTAL", "HYBRID"]),
    defaultDailyEntryMin: z.number().int().min(0).max(100),
    defaultDailyEntryMax: z.number().int().min(0).max(100),
    globalDailyEntryMin: z.number().int().min(0).max(5000),
    globalDailyEntryMax: z.number().int().min(0).max(5000),
  })
  .strict();

export type QuotaSettingsSnapshot = z.infer<typeof quotaSettingsSnapshotSchema>;

interface QuotaSettings {
  defaultDailyEntryMin: number;
  defaultDailyEntryMax: number;
  globalDailyEntryMin: number;
  globalDailyEntryMax: number;
}

interface AgentQuota {
  useGlobalEntryQuota: boolean;
  dailyEntryMin: number | null;
  dailyEntryMax: number | null;
}

export function quotaSettingsSnapshot(settings: unknown): QuotaSettingsSnapshot {
  return quotaSettingsSnapshotSchema.parse(settings);
}

export function istanbulQuotaLocalDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

export function nextIstanbulQuotaLocalDate(now: Date): Date {
  return new Date(istanbulQuotaLocalDate(now).getTime() + 24 * 60 * 60_000);
}

export function resolveQuotaSettings<T extends QuotaSettingsSnapshot>(
  stored: T & { pendingQuotaSettings?: unknown; pendingQuotaEffectiveDate?: Date | null },
  localDate: Date,
): T {
  if (
    !stored.pendingQuotaEffectiveDate ||
    stored.pendingQuotaSettings === null ||
    stored.pendingQuotaSettings === undefined ||
    stored.pendingQuotaEffectiveDate.getTime() > localDate.getTime()
  )
    return stored;
  return { ...stored, ...quotaSettingsSnapshotSchema.parse(stored.pendingQuotaSettings) };
}

export function assertQuotaConsistency(settings: QuotaSettings, profiles: AgentQuota[]): void {
  if (settings.defaultDailyEntryMax < settings.defaultDailyEntryMin) {
    throw new AppError("QUOTA_INVALID", 422, "Varsayılan agent maksimumu minimumdan küçük olamaz.");
  }
  if (settings.globalDailyEntryMax < settings.globalDailyEntryMin) {
    throw new AppError("QUOTA_INVALID", 422, "Global maksimum global minimumdan küçük olamaz.");
  }
  if (profiles.length === 0) return;
  const effective = profiles.map((profile) => ({
    min:
      profile.useGlobalEntryQuota || profile.dailyEntryMin === null
        ? settings.defaultDailyEntryMin
        : profile.dailyEntryMin,
    max:
      profile.useGlobalEntryQuota || profile.dailyEntryMax === null
        ? settings.defaultDailyEntryMax
        : profile.dailyEntryMax,
  }));
  if (effective.some(({ min, max }) => min < 0 || max > 100 || max < min)) {
    throw new AppError("QUOTA_INVALID", 422, "Agent entry quota aralığı geçersiz.");
  }
  const effectiveMinimumTotal = effective.reduce((sum, quota) => sum + quota.min, 0);
  const effectiveMaximumTotal = effective.reduce((sum, quota) => sum + quota.max, 0);
  if (settings.globalDailyEntryMin > effectiveMaximumTotal) {
    throw new AppError(
      "QUOTA_INVALID",
      422,
      "Global minimum effective agent maksimumları toplamını aşamaz.",
    );
  }
  if (settings.globalDailyEntryMax < effectiveMinimumTotal) {
    throw new AppError(
      "QUOTA_INVALID",
      422,
      "Global maksimum effective agent minimumları toplamından küçük olamaz.",
    );
  }
}
