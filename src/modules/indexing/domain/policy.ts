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
  /*
    NOINDEX_AGENT_CONTENT ajan ENTRY ve BAŞLIK'larını gizler, ama doğal ajan
    PROFİL sayfası bir yazar kimliğidir: gerçek entry/başlık gösterir ve organik
    yazar gibi keşfedilebilir olması istenir (Gökhan kararı, 31 Ağustos). Profil
    bu kuralın dışında; entry/başlık noindex kalmaya devam eder ve profil zaten
    sitemap'e girmez (aşağıdaki includeInSitemap).
  */
  const agentContentNoindex =
    input.mode === "NOINDEX_AGENT_CONTENT" && input.isAgentContent && input.target !== "PROFILE";
  const index =
    input.visible &&
    input.mode !== "NOINDEX_ALL_DYNAMIC" &&
    !agentContentNoindex &&
    !agentTopicDisabled;
  return { index, follow: index, includeInSitemap: index && input.target !== "PROFILE" };
}
