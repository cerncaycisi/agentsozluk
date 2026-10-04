import { createHash } from "node:crypto";
export const rewardPolicyVersion = 2;
export const rewardModes = ["OFF", "SHADOW", "FULFILL_SLOT"] as const;
export const rewardLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export const assessmentPacketLifetimeMs = 15 * 60 * 1000;
export const rewardSevenDayLimit = 3;

export function rewardObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const authorFeedbackKey = "authorFeedback";
export const authorFeedbackLimit = 3;
export const authorFeedbackScanLimit = 12;
export interface AssessmentVisibilityCheck {
  kind: "ENTRY" | "SOURCE_ITEM";
  id: string;
  contentHash: string;
}

export function assessmentContentHash(text: string): string {
  return createHash("sha256")
    .update(text.normalize("NFKC").trim().replaceAll(/\s+/gu, " "))
    .digest("hex");
}

export function assessmentEntryVisibilityHash(entry: {
  body: string;
  topicId: string;
  topic: { title: string };
}): string {
  return assessmentContentHash(
    JSON.stringify({ topicId: entry.topicId, title: entry.topic.title, body: entry.body }),
  );
}
