/*
  Codex model profillerinin kapalı ad listesi. Profil tablosu (model ve çaba) sağlayıcıda
  (`codex-cli-provider.ts`) durur ve bu listeyle derleme anında eşleşir; burada yalnız adlar
  vardır. Ayrı modül: sunucunun telemetri şeması (`runtime-schemas.ts`, `voice.profile`) adı
  doğrularken CLI sağlayıcısını ve onun Node süreç bağımlılıklarını yüklemez.
*/
export const agentRuntimeCodexProfileNames = [
  "luna-max",
  "sol-medium",
  "sol6-medium",
  "terra-medium",
  "sol56-medium",
  "luna6-max",
  "luna6-medium",
] as const;

export type AgentRuntimeCodexProfileName = (typeof agentRuntimeCodexProfileNames)[number];
