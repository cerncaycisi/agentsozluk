import { istanbulCalendarDateKey } from "@/modules/agents/domain/runtime-controls";

export const birthParentPoolLimit = 40;
export const birthParentScanLimit = 8;

export function birthScanDue(
  settings: {
    birthMode: "OFF" | "CANDIDATES";
    lastBirthScanAt: Date | null;
    runtimeEnabled: boolean;
    schedulerEnabled: boolean;
    publishEnabled: boolean;
    publicWriteEnabled: boolean;
    runtimeOperatingMode: string;
  },
  now: Date,
): boolean {
  return (
    settings.birthMode === "CANDIDATES" &&
    settings.runtimeEnabled &&
    settings.schedulerEnabled &&
    settings.publishEnabled &&
    settings.publicWriteEnabled &&
    settings.runtimeOperatingMode === "NORMAL" &&
    (settings.lastBirthScanAt === null ||
      istanbulCalendarDateKey(settings.lastBirthScanAt) < istanbulCalendarDateKey(now))
  );
}

// Sıralı DB kümesinde başlangıç her İstanbul gününde döner; aynı UUID sürekli önce gelmez.
export function rotateBirthParents<T>(parents: readonly T[], now: Date): T[] {
  if (!parents.length) return [];
  const day = Math.floor(Date.parse(`${istanbulCalendarDateKey(now)}T00:00:00Z`) / 86400000);
  const offset =
    (((day * birthParentScanLimit) % parents.length) + parents.length) % parents.length;
  return [...parents.slice(offset), ...parents.slice(0, offset)];
}
