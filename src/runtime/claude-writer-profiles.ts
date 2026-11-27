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

/*
  Gemini yazar (27 Kasım 2026, Gökhan: "gemini modellerine de yazdıralım", "yes"). Antigravity
  CLI (`agy`) Google hesabıyla giriş yapılmış izole dizinde koşar. Yerel kör eşli okumada aynı 16
  bağlamda Hydrogen 3,33 / Claude 3,0 / Neon 3,0 (n=3/model); korumadan geçen 14/14/12.
*/
export const geminiWriterProfiles = {
  "hydrogen-high": { model: "gemini-4-hydrogen-high" },
  "neon-high": { model: "gemini-4-neon-high" },
} as const;
export type GeminiWriterProfileName = keyof typeof geminiWriterProfiles;
export const geminiWriterProfileNames = Object.keys(geminiWriterProfiles) as [
  GeminiWriterProfileName,
  ...GeminiWriterProfileName[],
];

export type WriterProfileName = ClaudeWriterProfileName | GeminiWriterProfileName;
export const writerProfileNames = [...claudeWriterProfileNames, ...geminiWriterProfileNames] as [
  WriterProfileName,
  ...WriterProfileName[],
];

export const claudeWriterSafeCodes = [
  "CLAUDE_TIMEOUT",
  "CLAUDE_CANCELLED",
  "CLAUDE_AUTH_REQUIRED",
  "CLAUDE_USAGE_LIMITED",
  "CLAUDE_EXEC_FAILED",
  "CLAUDE_OUTPUT_INVALID",
] as const;
export type ClaudeWriterSafeCode = (typeof claudeWriterSafeCodes)[number];

export const geminiWriterSafeCodes = [
  "GEMINI_TIMEOUT",
  "GEMINI_CANCELLED",
  "GEMINI_AUTH_REQUIRED",
  "GEMINI_USAGE_LIMITED",
  "GEMINI_EXEC_FAILED",
  "GEMINI_OUTPUT_INVALID",
] as const;
export type GeminiWriterSafeCode = (typeof geminiWriterSafeCodes)[number];

/** Yazar çağrısının güvenli hata kodları (koşu özeti `writer.failureCodes`). */
export const writerSafeCodes = [...claudeWriterSafeCodes, ...geminiWriterSafeCodes] as const;
export type WriterSafeCode = (typeof writerSafeCodes)[number];

/** Yerel korumanın Claude gövdesini reddetme nedenleri (`runtimeWriterBodyIssue`). */
export const claudeWriterGuardCodes = [
  "EMPTY",
  "MARKUP",
  "SERVER_SCHEMA",
  "CONSTITUTION",
  "QUOTE",
  "OFFLINE_CLAIM",
  "SERIOUS_CLAIM",
  "SENSITIVE",
  "META_REFERENCE",
] as const;
export type ClaudeWriterGuardCode = (typeof claudeWriterGuardCodes)[number];
