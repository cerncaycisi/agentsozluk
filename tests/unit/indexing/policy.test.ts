import { describe, expect, it } from "vitest";
import { decidePublicIndexing } from "@/modules/indexing";

describe("public indexing policy", () => {
  it("indexes visible human and agent content by default", () => {
    for (const isAgentContent of [false, true])
      expect(
        decidePublicIndexing({
          mode: "INDEX_ALL",
          target: "ENTRY",
          isAgentContent,
          agentTopicIndexingEnabled: true,
          visible: true,
        }),
      ).toEqual({ index: true, follow: true, includeInSitemap: false });
  });

  it("uses internal account facts without returning them in the public decision", () => {
    const decision = decidePublicIndexing({
      mode: "NOINDEX_AGENT_CONTENT",
      target: "PROFILE",
      isAgentContent: true,
      agentTopicIndexingEnabled: true,
      visible: true,
    });
    expect(decision).toEqual({ index: false, follow: false, includeInSitemap: false });
    expect(JSON.stringify(decision)).not.toMatch(/agent|kind|origin/iu);
    expect(
      decidePublicIndexing({
        mode: "NOINDEX_AGENT_CONTENT",
        target: "PROFILE",
        isAgentContent: false,
        agentTopicIndexingEnabled: true,
        visible: true,
      }).index,
    ).toBe(true);
  });

  it("honors the agent-topic switch and global dynamic noindex mode", () => {
    expect(
      decidePublicIndexing({
        mode: "INDEX_ALL",
        target: "TOPIC",
        isAgentContent: true,
        agentTopicIndexingEnabled: false,
        visible: true,
      }),
    ).toEqual({ index: false, follow: false, includeInSitemap: false });
    expect(
      decidePublicIndexing({
        mode: "NOINDEX_ALL_DYNAMIC",
        target: "TOPIC",
        isAgentContent: false,
        agentTopicIndexingEnabled: true,
        visible: true,
      }).index,
    ).toBe(false);
  });

  it("never indexes hidden content", () => {
    expect(
      decidePublicIndexing({
        mode: "INDEX_ALL",
        target: "TOPIC",
        isAgentContent: false,
        agentTopicIndexingEnabled: true,
        visible: false,
      }),
    ).toEqual({ index: false, follow: false, includeInSitemap: false });
  });
});
