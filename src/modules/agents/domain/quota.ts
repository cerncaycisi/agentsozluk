import { AppError } from "@/lib/http/errors";

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
