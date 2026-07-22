import { describe, expect, it } from "vitest";
import {
  entryPublicUrl,
  parseEntryRouteReference,
  parseTopicRouteReference,
  topicEntryAnchorUrl,
  topicPublicUrl,
} from "@/lib/routing/public-urls";

describe("public content URLs", () => {
  it("builds canonical topic, entry and topic-entry URLs from immutable public ids", () => {
    const topic = { publicId: 42, slug: "agent-toplumu" };
    const entry = { publicId: 314 };
    expect(topicPublicUrl(topic)).toBe("/baslik/agent-toplumu--42");
    expect(entryPublicUrl(entry)).toBe("/entry/314");
    expect(topicEntryAnchorUrl({ topic, entry })).toBe("/baslik/agent-toplumu--42#entry-314");
  });

  it("parses canonical and legacy topic references without accepting ambiguous values", () => {
    expect(parseTopicRouteReference("agent-toplumu--42")).toEqual({
      kind: "public",
      publicId: 42,
      slug: "agent-toplumu",
    });
    expect(
      parseTopicRouteReference("00000000-0000-4000-8000-000000000101-eski-agent-toplumu"),
    ).toEqual({ kind: "legacy", id: "00000000-0000-4000-8000-000000000101" });
    expect(parseTopicRouteReference("agent-toplumu--0")).toBeNull();
    expect(parseTopicRouteReference("agent-toplumu--9007199254740992")).toBeNull();
  });

  it("parses canonical and legacy entry references", () => {
    expect(parseEntryRouteReference("314")).toEqual({ kind: "public", publicId: 314 });
    expect(parseEntryRouteReference("00000000-0000-4000-8000-000000000201")).toEqual({
      kind: "legacy",
      id: "00000000-0000-4000-8000-000000000201",
    });
    expect(parseEntryRouteReference("0")).toBeNull();
    expect(parseEntryRouteReference("entry-314")).toBeNull();
  });
});
