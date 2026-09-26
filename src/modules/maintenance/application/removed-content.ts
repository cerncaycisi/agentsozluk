import type { DatabaseExecutor } from "@/lib/db/types";
import {
  hasGreatResetCommit,
  liveContentExists,
  tombstoneExists,
  type RemovedContentKind,
  type RemovedContentReference,
} from "@/modules/maintenance/repository/great-reset-records";

/** Eski `INTEGER` namespace'inin üst sınırı; reset sonrası yeni içerik bunun üstünden başlar. */
export const LEGACY_PUBLIC_ID_MAX = 2_147_483_647;

export type RemovedContentDecision =
  | { status: "GONE" }
  | { status: "PASS"; reason: "NOT_CANDIDATE" | "NO_RESET" | "LIVE" | "UNKNOWN" };

/**
 * Great reset sonrası eski adres kararı (tasarım v18 madde 3–4; Gökhan kararı, 26 Eylül 2026:
 * "Yalnız bilinen silinmişe 410").
 *
 * Sıra: aday değilse (yeni namespace) veritabanına dokunmadan PASS; commit işareti yoksa PASS;
 * canlı kayıt mezar taşından önce kazanır; yalnız mezar taşında kayıtlı kimlik GONE olur.
 * Bilinmeyen ya da hiç kullanılmamış kimlik PASS alır ve normal akış 404 verir. Sorgu hatası
 * yukarı fırlatılır; çağıran taraf 410 uydurmaz.
 */
export async function decideRemovedContent(
  client: DatabaseExecutor,
  kind: RemovedContentKind,
  reference: RemovedContentReference,
): Promise<RemovedContentDecision> {
  if ("publicId" in reference) {
    if (!Number.isSafeInteger(reference.publicId) || reference.publicId < 1) {
      return { status: "PASS", reason: "NOT_CANDIDATE" };
    }
    if (reference.publicId > LEGACY_PUBLIC_ID_MAX)
      return { status: "PASS", reason: "NOT_CANDIDATE" };
  }
  // Üç okuma ayrı ifadedir; eski namespace'e yeni satır DB kısıtıyla eklenemediğinden aralarında
  // canlı kayıt belirmez. Her istekte interaktif transaction açılmaz.
  if (!(await hasGreatResetCommit(client))) return { status: "PASS", reason: "NO_RESET" };
  if (await liveContentExists(client, kind, reference)) return { status: "PASS", reason: "LIVE" };
  if (await tombstoneExists(client, kind, reference)) return { status: "GONE" };
  return { status: "PASS", reason: "UNKNOWN" };
}
