import { describe, expect, it } from "vitest";
import {
  resolveRuntimeActionTarget,
  runtimeActionSchema,
  type RuntimeActionTargetResolution,
} from "@/modules/agents";

const topicId = "00000000-0000-4000-8000-000000000001";
const otherTopicId = "00000000-0000-4000-8000-000000000002";
const entryId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000004";

function resolve(action: Record<string, unknown>): RuntimeActionTargetResolution {
  return resolveRuntimeActionTarget(
    runtimeActionSchema.parse({
      sequence: 1,
      safeReason: "Action hedef semantiği fail-closed doğrulanıyor.",
      ...action,
    }),
  );
}

describe("runtime action target resolution", () => {
  it.each([
    {
      actionType: "EDIT_OWN_ENTRY",
      targetType: "ENTRY",
      targetId: entryId,
      input: { entryId, body: "Düzeltilmiş entry içeriği." },
      expected: { entryId },
    },
    {
      actionType: "VOTE_UP",
      targetType: "ENTRY",
      targetId: entryId,
      input: { entryId },
      expected: { entryId },
    },
    {
      actionType: "VOTE_DOWN",
      input: { entryId },
      expected: { entryId },
    },
    {
      actionType: "REMOVE_VOTE",
      targetType: "ENTRY",
      targetId: entryId,
      input: {},
      expected: { entryId },
    },
    {
      actionType: "BOOKMARK_ENTRY",
      targetType: "ENTRY",
      targetId: entryId,
      input: { entryId },
      expected: { entryId },
    },
    {
      actionType: "REMOVE_BOOKMARK",
      input: { entryId },
      expected: { entryId },
    },
    {
      actionType: "FOLLOW_TOPIC",
      targetType: "TOPIC",
      targetId: topicId,
      input: { topicId },
      expected: { topicId },
    },
    {
      actionType: "UNFOLLOW_TOPIC",
      input: { topicId },
      expected: { topicId },
    },
    {
      actionType: "FOLLOW_USER",
      targetType: "USER",
      targetId: userId,
      input: { userId },
      expected: { userId },
    },
    {
      actionType: "UNFOLLOW_USER",
      input: { userId },
      expected: { userId },
    },
    {
      actionType: "UPDATE_RELATIONSHIP_NOTE",
      targetType: "USER",
      targetId: userId,
      input: { userId, summary: "Görünür etkileşim özeti." },
      expected: { userId },
    },
  ] as const)("resolves the canonical target for $actionType", ({ expected, ...action }) => {
    expect(resolve(action)).toEqual({ ok: true, ...expected });
  });

  it("uses one canonical topic for normal and direct-response CREATE_ENTRY actions", () => {
    expect(
      resolve({
        actionType: "CREATE_ENTRY",
        targetType: "TOPIC",
        targetId: topicId,
        input: { topicId, body: "Normal topic entry içeriği." },
      }),
    ).toEqual({ ok: true, topicId });
    expect(
      resolve({
        actionType: "CREATE_ENTRY",
        targetType: "USER",
        targetId: userId,
        input: {
          topicId,
          replyToEntryId: entryId,
          body: "Doğrudan tepki entry içeriği.",
        },
      }),
    ).toEqual({ ok: true, topicId, entryId, userId });
  });

  it.each([
    {
      actionType: "NO_ACTION",
      input: {},
    },
    {
      actionType: "CREATE_TOPIC_WITH_ENTRY",
      input: { title: "Yeni topic", body: "Yeni topic için ilk entry." },
    },
    {
      actionType: "PROPOSE_SOURCE",
      input: { url: "https://example.com/feed.xml" },
    },
    {
      actionType: "UPDATE_BELIEF",
      input: {
        topicKey: "ölçüm",
        statement: "Ölçülebilir kararlar doğrulanabilir olmalıdır.",
        summary: "Görünür kanıt özeti.",
      },
    },
  ] as const)("accepts targetless $actionType", (action) => {
    expect(resolve(action)).toEqual({ ok: true });
  });

  it.each([
    {
      name: "USER target disguised as a topic without reply context",
      action: {
        actionType: "CREATE_ENTRY",
        targetType: "USER",
        targetId: topicId,
        input: { body: "Policy kontrolü atlanmamalıdır." },
      },
    },
    {
      name: "different CREATE_ENTRY topic ids",
      action: {
        actionType: "CREATE_ENTRY",
        targetType: "TOPIC",
        targetId: topicId,
        input: { topicId: otherTopicId, body: "İki farklı topic kimliği kullanılmamalıdır." },
      },
    },
    {
      name: "reply context without a USER target",
      action: {
        actionType: "CREATE_ENTRY",
        targetType: "TOPIC",
        targetId: topicId,
        input: { topicId, replyToEntryId: entryId, body: "Yanıt hedefi açık olmalıdır." },
      },
    },
    {
      name: "ENTRY action with a USER target",
      action: {
        actionType: "VOTE_UP",
        targetType: "USER",
        targetId: userId,
        input: { entryId },
      },
    },
    {
      name: "different FOLLOW_TOPIC ids",
      action: {
        actionType: "FOLLOW_TOPIC",
        targetType: "TOPIC",
        targetId: topicId,
        input: { topicId: otherTopicId },
      },
    },
    {
      name: "orphan target type",
      action: {
        actionType: "FOLLOW_USER",
        targetType: "USER",
        input: { userId },
      },
    },
    {
      name: "target on a targetless action",
      action: {
        actionType: "NO_ACTION",
        targetType: "TOPIC",
        targetId: topicId,
        input: {},
      },
    },
  ] as const)("rejects $name", ({ action }) => {
    expect(resolve(action)).toMatchObject({
      ok: false,
      rejection: { code: "ACTION_TARGET_INVALID" },
    });
  });
});
