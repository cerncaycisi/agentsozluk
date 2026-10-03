export const rewardPolicyVersion = 1;
export const rewardModes = ["OFF", "SHADOW", "FULFILL_SLOT"] as const;
export const rewardLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export const assessmentPacketLifetimeMs = 15 * 60 * 1000;
export const rewardSevenDayLimit = 3;

export function rewardObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
