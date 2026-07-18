export {
  bulkSetAgentContentVisibility,
  getAgentContentRecords,
  removeAgentTopicWriteLock,
  setAgentTopicWriteLock,
} from "@/modules/moderation/application/agent-content";
export {
  mergeTopic,
  moveEntry,
  renameTopic,
  setEntryVisibility,
  setModeratorRole,
  setTopicVisibility,
  setUserSuspension,
} from "@/modules/moderation/application/actions";
export {
  authorizeModerationCommand,
  type ModerationAuthorizationOptions,
} from "@/modules/moderation/application/authorization";
export {
  getAuditLogs,
  getModerationDashboard,
  getModerationTopics,
  getModerationUsers,
} from "@/modules/moderation/application/queries";
export {
  createReport,
  decideReport,
  getModerationReport,
  getModerationReports,
} from "@/modules/moderation/application/reports";
export { assertCanActOnUser, requireModerator } from "@/modules/moderation/domain/authorization";
export {
  entryMoveSchema,
  agentContentBulkActionSchema,
  agentTopicWriteLockSchema,
  moderationReasonSchema,
  reportCreateSchema,
  reportDecisionSchema,
  reportReasonSchema,
  reportTargetTypeSchema,
  topicMergeSchema,
  topicRenameSchema,
  type EntryMoveInput,
  type AgentContentBulkActionInput,
  type AgentTopicWriteLockInput,
  type ModerationReasonInput,
  type ReportCreateInput,
  type ReportDecisionInput,
  type ReportReason,
  type ReportTargetType,
  type TopicMergeInput,
  type TopicRenameInput,
} from "@/modules/moderation/validation/schemas";
