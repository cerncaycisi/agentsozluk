import { AppError } from "@/lib/http/errors";
import type { ActorContext } from "@/modules/auth/domain/actor";
import type { ModerationCapabilityName } from "@/modules/moderation/domain/gammaz";

interface ModerationPrincipal {
  id: string;
  kind?: "HUMAN" | "AGENT";
  role: "USER" | "MODERATOR" | "ADMIN";
  status: string;
  moderationCapabilities?: Array<{ capability: ModerationCapabilityName }>;
}

export function requireModerator(
  user: ModerationPrincipal | null,
  actor: ActorContext,
  options: { adminOnly?: boolean } = {},
) {
  const permitted =
    user?.id === actor.actorId &&
    user?.status === "ACTIVE" &&
    (options.adminOnly
      ? user.role === "ADMIN"
      : user.role === "MODERATOR" || user.role === "ADMIN");
  if (!permitted) throw new AppError("FORBIDDEN", 403, "Bu işlem için yetkiniz yok.");
  return user;
}

export function requireModerationCapability(
  user: ModerationPrincipal | null,
  actor: ActorContext,
  capability: ModerationCapabilityName,
): ModerationPrincipal {
  const permitted =
    user?.id === actor.actorId &&
    user.status === "ACTIVE" &&
    user.kind !== "AGENT" &&
    user.moderationCapabilities?.some((record) => record.capability === capability);
  if (!permitted)
    throw new AppError(
      "MODERATION_CAPABILITY_REQUIRED",
      403,
      `Bu işlem için ${capability} capability’si gerekir.`,
    );
  return user;
}

export function requireAnyModerationCapability(
  user: ModerationPrincipal | null,
  actor: ActorContext,
  capabilities: readonly ModerationCapabilityName[],
): ModerationPrincipal {
  const permitted =
    user?.id === actor.actorId &&
    user.status === "ACTIVE" &&
    user.kind !== "AGENT" &&
    capabilities.some((capability) =>
      user.moderationCapabilities?.some((record) => record.capability === capability),
    );
  if (!permitted)
    throw new AppError(
      "MODERATION_CAPABILITY_REQUIRED",
      403,
      "Bu moderasyon kuyruğu için uygun capability gerekir.",
    );
  return user;
}

export function assertCanActOnUser(
  moderator: { id: string; role: "USER" | "MODERATOR" | "ADMIN" },
  target: { id: string; role: "USER" | "MODERATOR" | "ADMIN" },
): void {
  if (
    target.role === "ADMIN" ||
    moderator.id === target.id ||
    (moderator.role === "MODERATOR" && target.role !== "USER")
  ) {
    throw new AppError("FORBIDDEN", 403, "Bu kullanıcı üzerinde işlem yapamazsınız.");
  }
}
