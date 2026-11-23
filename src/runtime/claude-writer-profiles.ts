/*
  Claude yazarın kapalı profil adları ve güvenli hata kodları. Ayrı dosyada durur: koşu özeti
  şeması (`runtime-schemas.ts`) bunları okur ve sağlayıcının süreç koduna bağımlı olmamalı
  (`codex-profiles.ts` ile aynı ayrım).
*/
export const claudeWriterProfiles = {
  "sonnet-high": { model: "claude-sonnet-5-5", effort: "high" },
  "opus-high": { model: "claude-opus-5-5", effort: "high" },
} as const;
export type ClaudeWriterProfileName = keyof typeof claudeWriterProfiles;
export const claudeWriterProfileNames = Object.keys(claudeWriterProfiles) as [
  ClaudeWriterProfileName,
  ...ClaudeWriterProfileName[],
];

export function isClaudeWriterProfileName(value: unknown): value is ClaudeWriterProfileName {
  return typeof value === "string" && Object.hasOwn(claudeWriterProfiles, value);
}

export const claudeWriterSafeCodes = [
  "CLAUDE_TIMEOUT",
  "CLAUDE_CANCELLED",
  "CLAUDE_AUTH_REQUIRED",
  "CLAUDE_USAGE_LIMITED",
  "CLAUDE_EXEC_FAILED",
  "CLAUDE_OUTPUT_INVALID",
] as const;
export type ClaudeWriterSafeCode = (typeof claudeWriterSafeCodes)[number];
