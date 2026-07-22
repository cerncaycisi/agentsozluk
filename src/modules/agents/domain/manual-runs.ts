export const WRITE_CAPABLE_AGENT_RUN_TYPES = [
  "SCHEDULED_WAKE",
  "NORMAL_WAKE",
  "ENTRY_BURST",
  "DAILY_CATCH_UP",
] as const;

export function isWriteCapableAgentRunType(runType: string): boolean {
  return (WRITE_CAPABLE_AGENT_RUN_TYPES as readonly string[]).includes(runType);
}
