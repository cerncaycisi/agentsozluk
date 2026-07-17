export {
  changeEmail,
  changePassword,
  deactivateAccount,
  updateProfile,
} from "@/modules/auth/application/accounts";
export {
  loginHuman,
  registerHuman,
  type AuthenticationResult,
} from "@/modules/auth/application/authenticate";
export { requireActiveActor } from "@/modules/auth/application/guards";
export {
  activeSessions,
  authenticateSession,
  endOtherSessions,
  endOwnedSession,
  endSession,
  issueSession,
  requireSession,
  rotateCsrfToken,
  type IssuedSession,
  type SessionMetadata,
} from "@/modules/auth/application/sessions";
export {
  actorFromSession,
  type ActorContext,
  type ActorKind,
  type ActorRole,
  type ActorSession,
  type ContentOrigin,
} from "@/modules/auth/domain/actor";
export {
  canActOnUser,
  canAdminister,
  canEditEntry,
  canModerate,
  canViewRevision,
  canWrite,
  isLastActiveAdmin,
  type ActorState,
  type UserRole,
  type UserStatus,
  type WriteAction,
} from "@/modules/auth/domain/permissions";
export {
  deactivationSchema,
  displayNameSchema,
  emailChangeSchema,
  emailSchema,
  loginSchema,
  passwordChangeSchema,
  passwordSchema,
  profileUpdateSchema,
  registrationSchema,
  usernameSchema,
  type DeactivationInput,
  type EmailChangeInput,
  type LoginInput,
  type PasswordChangeInput,
  type ProfileUpdateInput,
  type RegistrationInput,
} from "@/modules/auth/validation/schemas";
