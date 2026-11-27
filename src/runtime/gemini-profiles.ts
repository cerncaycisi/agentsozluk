/*
  Gemini ana runtime profillerinin kapalı ad listesi ve model eşlemesi. Ayrı modül: sunucu
  şeması ya da betikler CLI sağlayıcısını ve onun süreç bağımlılıklarını yüklemeden profil
  adlarını doğrulayabilir (`codex-profiles.ts` ve `claude-writer-profiles.ts` ile aynı ayrım).
*/
export const AGENT_RUNTIME_GEMINI_PROFILES = {
  "hydrogen-high": { model: "gemini-4-hydrogen-high", reasoningEffort: "high" },
  "hydrogen-medium": { model: "gemini-4-hydrogen-medium", reasoningEffort: "medium" },
  "hydrogen-low": { model: "gemini-4-hydrogen-low", reasoningEffort: "low" },
  "neon-high": { model: "gemini-4-neon-high", reasoningEffort: "high" },
  "neon-medium": { model: "gemini-4-neon-medium", reasoningEffort: "medium" },
  "carbon-high": { model: "gemini-4-carbon-high", reasoningEffort: "high" },
  "carbon-medium": { model: "gemini-4-carbon-medium", reasoningEffort: "medium" },
  "flash-high": { model: "gemini-3.8-flash-high", reasoningEffort: "high" },
  "flash-medium": { model: "gemini-3.8-flash-medium", reasoningEffort: "medium" },
} as const;

export type AgentRuntimeGeminiProfileName = keyof typeof AGENT_RUNTIME_GEMINI_PROFILES;

export const agentRuntimeGeminiProfileNames = Object.keys(AGENT_RUNTIME_GEMINI_PROFILES) as [
  AgentRuntimeGeminiProfileName,
  ...AgentRuntimeGeminiProfileName[],
];
