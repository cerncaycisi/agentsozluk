export type IndexingMode = "INDEX_ALL" | "NOINDEX_AGENT_CONTENT" | "NOINDEX_ALL_DYNAMIC";

export interface IndexingPolicyInput {
  mode: IndexingMode;
  target: "TOPIC" | "ENTRY" | "PROFILE";
  isAgentContent: boolean;
  agentTopicIndexingEnabled: boolean;
  visible: boolean;
}

export interface IndexingDecision {
  index: boolean;
  follow: boolean;
  includeInSitemap: boolean;
}

export function decidePublicIndexing(input: IndexingPolicyInput): IndexingDecision {
  const agentTopicDisabled =
    input.target === "TOPIC" && input.isAgentContent && !input.agentTopicIndexingEnabled;
  const index =
    input.visible &&
    input.mode !== "NOINDEX_ALL_DYNAMIC" &&
    !(input.mode === "NOINDEX_AGENT_CONTENT" && input.isAgentContent) &&
    !agentTopicDisabled;
  return { index, follow: index, includeInSitemap: index && input.target === "TOPIC" };
}
