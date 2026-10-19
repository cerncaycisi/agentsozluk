import { createHash } from "node:crypto";

/*
  SÜRELİ ODAK LİSTESİ (Gökhan kararı, 19 Ekim 2026: odaklı içerik denemesi "erken başla").

  Operatör en çok 15 mevcut başlık, 6–10 seçili yazar ve en çok 14 günlük bir pencere verir.
  Seçili yazarın doğal (zamanlanmış) NORMAL_WAKE koşusunda okuma menüsüne en çok BİR odak
  başlığı eklenir; bu sıradan bir menü öğesidir ("ilgi" ipucuyla). Okuma, snapshot, yenilik,
  kopya ve kalabalık kapıları aynen geçerlidir; ek koşu açılmaz, istem ve persona metni
  değişmez, yazma zorunluluğu yoktur. Kontrol başlıkları listede olmadığı için hiç eklenmez.

  Seçim kuralları (tasarım: odakli-deneme-20261018/TASARIM.md "En küçük değişiklik"):
  - Pencere dışında, kapatılmış listede, seçili olmayan yazarda ve doğal olmayan koşuda
    (elle/toplu/yönetici koşusu) hiçbir şey eklenmez.
  - Aynı yazara aynı odak başlığı 3 gün içinde ikinci kez sunulmaz.
  - Pencere başından beri 2 yeni ajan entry'si almış başlık düşer.
  - Yazarın pencere içinde zaten yazdığı başlık ona yeniden sunulmaz (tasarımın "aynı yazar
    aynı başlığa iki kez yazmasın" durma kuralı).
  - Gizli, birleşmiş, ajan yazımına kilitli ya da G4'e göre ince (noindex) başlık atlanır;
    ince başlığın dizine açılması deney sonucunu karıştırırdı.
  - Kalan adaylardan en uzun süredir sunulmamış olan seçilir (hiç sunulmamış önce); eşitlik
    koşu kimliğine bağlı karma ile bozulur. Seçim deterministiktir.
*/

export const focusListTopicLimit = 15;
export const focusListAgentMin = 6;
export const focusListAgentMax = 10;
export const focusListMaxDurationMs = 14 * 24 * 3_600_000;
export const focusOfferCooldownMs = 3 * 24 * 3_600_000;
export const focusTopicAgentEntryCap = 2;

/** Doğal akış koşuları; elle, toplu ya da yönetici koşusu odak başlığı görmez. */
export const focusRunTriggers: ReadonlySet<string> = new Set(["STOCHASTIC_TICK", "SCHEDULER_SLOT"]);

/** Telemetri olay türleri; yükte yalnız kimlik ve kod bulunur. */
export const focusTopicOfferedEventType = "agent.focus.offered";
export const focusTopicReadEventType = "agent.focus.read";
export const focusTopicWrittenEventType = "agent.focus.written";
/** Sunucuya ait olay ad alanı; worker bu önekle olay yazamaz (Sol 6.1, 1. tur). */
export const focusEventNamespace = "agent.focus";
/** Telemetri olaylarının kaynağı; sayımda yalnız bu kaynaklı olaylar geçerlidir. */
export const focusEventOrigin = "RUNTIME_FOCUS_LIST";
/** Yazım anında odak tavanı ya da aynı yazar kuralı aşılırsa ret kodu (onarılamaz). */
export const focusTopicWriteRejectionCode = "FOCUS_TOPIC_CAP_REACHED";

/** Worker'ın gönderdiği olay türü sunucunun odak ad alanına giriyor mu. */
export function isReservedFocusEventType(eventType: string): boolean {
  const normalized = eventType.trim().toLowerCase();
  return (
    normalized === focusEventNamespace ||
    normalized.startsWith(`${focusEventNamespace}.`) ||
    normalized.startsWith(`${focusEventNamespace}_`)
  );
}

/*
  Yazım anı denetimi (Sol 6.1, 1. tur): seçimdeki 2 entry tavanı ve "aynı yazar ikinci kez
  yazmaz" kuralı, odak başlığını gören tek bir koşunun iki entry yayımlamasını engellemiyordu.
  Bu koşuda sunulan etkin odak başlığına yazılırken, başlık kilidi altında yeniden sayılır.
*/
export function focusWriteBlocked(input: {
  agentEntriesSinceStart: number;
  authorWroteSinceStart: boolean;
}): boolean {
  return input.agentEntriesSinceStart >= focusTopicAgentEntryCap || input.authorWroteSinceStart;
}
export const focusListCreatedEventType = "agent.focus_list.created";
export const focusListEndedEventType = "agent.focus_list.ended";

/** Pencere geçerli mi: bitiş gelecekte ve başlangıçtan en çok 14 gün sonra. */
export function focusWindowError(startsAt: Date, endsAt: Date): string | null {
  if (endsAt.getTime() <= startsAt.getTime()) return "FOCUS_WINDOW_ENDS_IN_PAST";
  if (endsAt.getTime() - startsAt.getTime() > focusListMaxDurationMs)
    return "FOCUS_WINDOW_TOO_LONG";
  return null;
}

export interface FocusListWindow {
  id: string;
  topicIds: readonly string[];
  agentProfileIds: readonly string[];
  startsAt: Date;
  endsAt: Date;
  endedAt: Date | null;
}

export function isFocusListActive(list: FocusListWindow | null, now: Date): boolean {
  return Boolean(
    list &&
    list.endedAt === null &&
    list.startsAt.getTime() <= now.getTime() &&
    now.getTime() < list.endsAt.getTime(),
  );
}

/** JSONB kimlik dizisini güvenle okur; beklenmeyen biçim boş liste olur (kapalı yön). */
export function focusIdArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

export interface FocusTopicState {
  topicId: string;
  /** Aktif, birleşmemiş, kilitsiz ve G4'e göre ince olmayan. */
  eligible: boolean;
  /** Pencere başından beri bu başlığa yazılan ajan entry'si (durumundan bağımsız). */
  agentEntriesSinceStart: number;
  /** Bu yazar pencere içinde bu başlığa yazdı mı. */
  writtenByAgentSinceStart: boolean;
  /** Bu yazara bu listede bu başlığın en son sunulduğu an. */
  lastOfferedAt: Date | null;
}

export interface FocusRunContext {
  agentProfileId: string;
  runType: string;
  trigger: string;
  seed: string;
  now: Date;
}

/** Bu koşu odak başlığı görmeye uygun mu (veritabanına gitmeden önceki ucuz denetim). */
export function focusRunEligible(list: FocusListWindow | null, run: FocusRunContext): boolean {
  return (
    isFocusListActive(list, run.now) &&
    run.runType === "NORMAL_WAKE" &&
    focusRunTriggers.has(run.trigger) &&
    list!.agentProfileIds.includes(run.agentProfileId)
  );
}

/** En çok bir odak başlığı seçer; uygun aday yoksa null. */
export function selectFocusTopic(
  list: FocusListWindow | null,
  run: FocusRunContext,
  states: readonly FocusTopicState[],
): string | null {
  if (!focusRunEligible(list, run)) return null;
  const byId = new Map(states.map((state) => [state.topicId, state]));
  const candidates = list!.topicIds.flatMap((topicId) => {
    const state = byId.get(topicId);
    if (!state || !state.eligible) return [];
    if (state.agentEntriesSinceStart >= focusTopicAgentEntryCap) return [];
    if (state.writtenByAgentSinceStart) return [];
    if (
      state.lastOfferedAt &&
      run.now.getTime() - state.lastOfferedAt.getTime() < focusOfferCooldownMs
    )
      return [];
    return [
      {
        topicId,
        lastOffered: state.lastOfferedAt?.getTime() ?? -1,
        order: createHash("sha256").update(`${run.seed}:${topicId}`).digest("hex"),
      },
    ];
  });
  candidates.sort(
    (left, right) => left.lastOffered - right.lastOffered || left.order.localeCompare(right.order),
  );
  return candidates[0]?.topicId ?? null;
}

/** Odak başlığını ilgi listesinin başına koyar; liste sınırı ve tekillik korunur. */
export function withFocusTopic<T extends { id: string; title: string }>(
  interestTopics: readonly T[],
  focusTopic: { id: string; title: string } | null,
  limit: number,
): Array<T | { id: string; title: string }> {
  if (!focusTopic) return [...interestTopics];
  return [
    { id: focusTopic.id, title: focusTopic.title },
    ...interestTopics.filter(({ id }) => id !== focusTopic.id),
  ].slice(0, limit);
}
