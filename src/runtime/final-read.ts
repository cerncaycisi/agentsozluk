import { z } from "zod";
import {
  constitutionalEntryWritingIssue,
  constitutionalTopicCreationIssue,
} from "@/lib/content/constitution-writing-policy";
import {
  hasUnrecordedOfflineFirstPersonClaim,
  repeatedEntryFraming,
  textContainsSeriousCrimeMarker,
  textContainsUncertaintyFrame,
  unframedSeriousClaimSentences,
  userEntryContainsHighRiskReproduction,
} from "@/modules/agents/domain/action-policy";
import type { RuntimeDecision } from "@/runtime/output";

/*
  Son okuma (9 Ekim 2026): yazar entry'yi yayımlamadan önce bir kez daha okur ve yalnız SİLER.
  Model numaralı parçalardan hangilerinin gideceğini söyler; yeni gövdeyi sunucu tarafı kod
  kalan parçalardan kurar. Model metne tek kelime ekleyemez, değiştiremez, sırayı bozamaz.

  Neden: yazım istemindeki yasaklar (v8 öz-denetim, v10 somut bitiş) özdeyiş kapanışı ve
  dolguyu düşürmedi; v10 doğallığı ve kişisel tonu da düşürdü. Ayrı ve dar bir silme sorusu,
  daha önce iki hakemin etiketlediği 116 entry'de silme yaptığı 32 entry'de özdeyiş kapanışı
  18 → 8 (Opus) ve 13 → 7 (Fable), dolguyu 13 → 3 ve 10 → 2 indirdi; doğallık 2,75 → 3,03 ve
  3,56 → 3,56 (docs/YEREL_KANIT_2026-10-08.md).

  Korumalar deterministiktir: ilk parça, soru, bağlantı, alıntı ya da URL taşıyan parça silinmez; bütün
  parçalar silinemez; kalan metin özgün gövdenin yarısından ve 20 kelimeden kısa olamaz. Hata, geçersiz çıktı
  ya da yetersiz süre gövdeyi olduğu gibi bırakır ve sayılır.
*/

/*
  Silmeden sonra en az bu kadar kelime kalmalı. Kısa entry'de son cümle çoğu zaman yazarın sesidir:
  eşli kör okumada kalan metin 20 kelimenin altına düşen 7 silmede doğallık −0,14, espri kaybı 1,
  özdeyiş kazancı 0,5'ti; 20 ve üstünde kalan 33 silmede doğallık +0,12…+0,27 ve özdeyiş kazancı 8.
*/
export const runtimeFinalReadMinKeptWords = 20;

/** Koşu başına en fazla bu kadar son okuma çağrısı; fazlası okunmadan yayımlanır ve sayılır. */
export const runtimeFinalReadCallLimit = 2;

export const runtimeFinalReadVerdictSchema = z
  .object({ sil: z.array(z.number().int()).max(40) })
  .strict();

export const runtimeFinalReadVerdictJsonSchema: Record<string, unknown> = Object.fromEntries(
  Object.entries(z.toJSONSchema(runtimeFinalReadVerdictSchema)).filter(
    ([key]) => key !== "$schema",
  ),
);

export type RuntimeFinalReadUnit = { text: string; separator: string };

export type RuntimeFinalReadCandidate = {
  sequence: number;
  topicTitle: string;
  body: string;
  units: RuntimeFinalReadUnit[];
  /** Kaynaklı entry: yalnız son parça, o da kaynak doğrulamasının baktığı bir şey taşımıyorsa. */
  lastUnitOnly: boolean;
  /** Yeni başlık açan entry: başlık anayasası gövdeyle birlikte denetlenir. */
  createsTopic: boolean;
  /** Kapanış çakışması karşılaştırması için algıdaki kendi son entry'leri ve başlıktaki diğerleri. */
  ownRecentBodies: string[];
  topicOtherBodies: string[];
};

export type RuntimeFinalReadContext = Partial<
  Pick<
    RuntimeFinalReadCandidate,
    "lastUnitOnly" | "createsTopic" | "topicTitle" | "ownRecentBodies" | "topicOtherBodies"
  >
>;

/*
  Parça sınırı: harf ya da kapanış işaretinden sonra gelen . ! ? … ; ve boşluk. Rakamdan sonraki
  nokta ("7. sulh ceza") bölmez. Noktalı virgül de sınırdır: özdeyiş çoğu zaman "…; X biraz da
  Y'dir" biçiminde aynı cümlenin ikinci yarısında gelir.

  Korunan aralıklar bölünmez ve onları taşıyan parça silinmez (Astra, 9 Ekim): bağlantılar
  renderer'ın kuralıyla (`entries/domain/renderer.ts`, büyük/küçük harf duyarsız), tırnak içi
  alıntılar ve URL'ler. "(bkz: dr. strangelove)" eskiden iki parçaya bölünüyordu.
*/
const unitBoundary = /(?<=[^\d\s][.!?…;])\s+|(?<=[^\d\s][.!?…]["'”’)\]])\s+/gu;
const protectedSpan =
  /\[\[[^\]\n]{2,100}\]\]|\(bkz:\s*[^)\n]{1,100}?\s*\)|“[^”]*”|"[^"]*"|«[^»]*»|https?:\/\/\S+/giu;

/*
  Alıntı sınırı güvenle bulunamayan gövde son okumaya girmez (Astra 2. tur, Sol 6.1): yönlü
  tırnaklar (“ ” ve « ») sırayla açılıp kapanmalı ve iç içe olmamalı; düz çift tırnak sayısı çift
  olmalı. Tek kıvrık tırnakla açılan alıntı hiç kabul edilmez (’ Türkçede kesme işareti olarak da
  kullanıldığı için ‘…’ aralığı güvenle eşlenemez).
*/
const quoteLike = /["“”«»'‘’]/gu;

function quotesUnambiguous(body: string): boolean {
  if (body.includes("‘")) return false;
  /*
    Sunucu ilke denetimi NFKC uygular: tam genişlikli ＂ orada " olur ve alıntı sayılır (Sol 6.1).
    Normalleştirme tırnak sayısını değiştiriyorsa alıntı sınırı güvenle bulunamaz.
  */
  if (
    (body.match(quoteLike) ?? []).join("") !==
    (body.normalize("NFKC").match(quoteLike) ?? []).join("")
  )
    return false;
  // Düz tırnak da aynı durum makinesine girer: çapraz ya da iç içe alıntı reddedilir (Sol 6.1).
  const closing: Record<string, string> = { "“": "”", "«": "»", '"': '"' };
  let open: string | null = null;
  for (const char of body) {
    if (open !== null && char === open) open = null;
    else if (char in closing) {
      if (open !== null) return false;
      open = closing[char]!;
    } else if (char === "”" || char === "»") return false;
  }
  return open === null;
}

/*
  Silme, sunucunun gövdeye bakan ilke kontrollerinden hiçbirinin sonucunu değiştirmemeli (Sol 6.1):
  "…rüşvet aldı; ancak bu iddia henüz doğrulanmadı." gövdesinden çekince silinince ciddi iddia
  güçlü kanıt ister hâle geliyordu. Ciddi iddia cümle bazında karşılaştırılır: silmeden sonra
  çekincesiz kalan her ciddi iddia cümlesi silmeden önce de aynen çekincesiz olmalı. Yeni başlıkta
  başlık anayasası gövdeyle birlikte, kapanış tekrarı algıdaki kendi ve başlık entry'leriyle
  önce/sonra karşılaştırılır. Herhangi biri değişirse özgün gövde kalır.
*/
function policyFingerprint(body: string, context: RuntimeFinalReadContext): string {
  return JSON.stringify([
    userEntryContainsHighRiskReproduction(body),
    hasUnrecordedOfflineFirstPersonClaim(body),
    constitutionalEntryWritingIssue(body)?.code ?? null,
    context.createsTopic
      ? (constitutionalTopicCreationIssue(context.topicTitle ?? "", body)?.code ?? null)
      : null,
    repeatedEntryFraming(body, context.ownRecentBodies ?? [], context.topicOtherBodies ?? [])
      ?.edge ?? null,
  ]);
}

function policyPreserved(before: string, after: string, context: RuntimeFinalReadContext): boolean {
  const unframedBefore = new Set(unframedSeriousClaimSentences(before));
  return (
    unframedSeriousClaimSentences(after).every((sentence) => unframedBefore.has(sentence)) &&
    policyFingerprint(after, context) === policyFingerprint(before, context)
  );
}

function protectedRanges(body: string): Array<[number, number]> {
  return [...body.matchAll(protectedSpan)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
}

export function runtimeFinalReadUnits(body: string): RuntimeFinalReadUnit[] {
  const ranges = protectedRanges(body);
  const units: RuntimeFinalReadUnit[] = [];
  let position = 0;
  for (const match of body.matchAll(unitBoundary)) {
    if (ranges.some(([start, end]) => match.index > start && match.index < end)) continue;
    units.push({ text: body.slice(position, match.index), separator: match[0] });
    position = match.index + match[0].length;
  }
  units.push({ text: body.slice(position), separator: "" });
  return units.filter(({ text }) => text.trim().length > 0);
}

/*
  Doğruluk çekincesi taşıyan parça hiçbir entry'de silinmez (Sol 6.1, 4. tur): "Ancak bu iddia
  henüz doğrulanmadı." ayrı cümle olduğunda sunucunun cümle bazlı çekince kontrolü önceki iddiayı
  çerçevelenmiş saymaz; silinince çekince sessizce kaybolurdu.
*/
function lockedUnit(text: string): boolean {
  return (
    text.includes("?") || protectedRanges(text).length > 0 || textContainsUncertaintyFrame(text)
  );
}

/**
 * Silinecek parça numaralarını (1 tabanlı) uygular. Korunan, aralık dışı ya da ilk parçayı
 * hedefleyen numaralar yok sayılır. Hiçbir şey silinmiyorsa ya da kalan metin korumaları
 * (yarıdan uzun, en az `runtimeFinalReadMinKeptWords` kelime) geçmiyorsa `null` döner; çağıran
 * gövdeyi olduğu gibi bırakır.
 */
/*
  Kaynaklı entry'de son parçayı kilitleyen işaretler: sayı ve atıf fiili. Kaynak doğrulaması
  sayıyı, alıntıyı ve iddianın sahibini gövdede arar; bunları taşımayan son cümle genelde
  "haber X'i vermiyor" türü çekince ya da özdeyiştir (9 Ekim yerel ölçüm: 33 kaynaklı entry'nin
  7'sinde silindi; iki hakemde özdeyiş 4 → 1 ve 3 → 0, dolgu 4 → 2 ve 2 → 0).
*/
const sourceLockedUnit =
  /\d|(?:^|[^\p{L}])(?:göre|aktardığı|aktarıyor|aktarılıyor|bildiriliyor|bildirdi|açıkladı|açıklıyor|açıklandı|belirtiyor|belirtildi|belirtiliyor|atfediliyor|dedi|diyor|söyledi)(?=$|[^\p{L}])/iu;

export function applyRuntimeFinalRead(
  body: string,
  units: readonly RuntimeFinalReadUnit[],
  deleteNumbers: readonly number[],
  context: RuntimeFinalReadContext = {},
): { body: string; removedUnitCount: number } | null {
  const lastUnitOnly = context.lastUnitOnly === true;
  const remove = new Set(
    deleteNumbers.filter(
      (number) =>
        number >= 2 &&
        number <= units.length &&
        !lockedUnit(units[number - 1]!.text) &&
        (!lastUnitOnly ||
          (number === units.length && !sourceLockedUnit.test(units[number - 1]!.text))),
    ),
  );
  if (remove.size === 0 || remove.size >= units.length) return null;
  const kept = units.filter((_, index) => !remove.has(index + 1));
  let text = kept
    .map(({ text: unit, separator }, index) => unit + (index < kept.length - 1 ? separator : ""))
    .join("")
    .trimEnd();
  if (text.endsWith(";") || text.endsWith(",")) text = `${text.slice(0, -1)}.`;
  if (text.length * 2 < body.length) return null;
  if (text.split(/\s+/u).filter(Boolean).length < runtimeFinalReadMinKeptWords) return null;
  if (!policyPreserved(body, text, context)) return null;
  return { body: text, removedUnitCount: remove.size };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Algıdaki başlık listelerinden kimlik → başlık eşlemesi; `CREATE_ENTRY` başlığı buradan gelir. */
export function runtimeFinalReadTopicTitles(
  perception: Record<string, unknown>,
): Map<string, string> {
  const titles = new Map<string, string>();
  for (const value of Object.values(perception)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const topic = record(item);
      if (topic && typeof topic.id === "string" && typeof topic.title === "string")
        titles.set(topic.id, topic.title);
    }
  }
  return titles;
}

const runtimeFinalReadSourceProvenance = new Set([
  "TRUSTED_SOURCE",
  "PROBATION_SOURCE",
  "MULTIPLE_SOURCES",
]);

/** Yayıma gidecek entry gövdeleri: iki ya da daha fazla parçası olan yeni entry'ler. */
export function runtimeFinalReadCandidates(
  decision: RuntimeDecision,
  perception: Record<string, unknown>,
): RuntimeFinalReadCandidate[] {
  const topicTitles = runtimeFinalReadTopicTitles(perception);
  const ownRecentBodies = (
    Array.isArray(perception.ownRecentEntries) ? perception.ownRecentEntries : []
  )
    .map((entry) => record(entry)?.body)
    .filter((body): body is string => typeof body === "string");
  const readTopics = (Array.isArray(perception.readTopics) ? perception.readTopics : [])
    .map(record)
    .filter((topic): topic is Record<string, unknown> => topic !== null);
  const topicOtherBodies = (topicId: unknown): string[] => {
    const topic = readTopics.find(({ id }) => id === topicId);
    return (Array.isArray(topic?.entries) ? topic.entries : [])
      .map(record)
      .filter((entry) => entry && entry.mine !== true && typeof entry.body === "string")
      .map((entry) => entry!.body as string);
  };
  return decision.actions.flatMap((action) => {
    if (action.actionType !== "CREATE_ENTRY" && action.actionType !== "CREATE_TOPIC_WITH_ENTRY")
      return [];
    const body = action.input.body;
    if (typeof body !== "string") return [];
    /*
      Kaynaklı entry'de aradan cümle silinmez (Astra, 9 Ekim): kaynak doğrulaması alıntı, sayı ve
      atfı gövdenin kendisinde arar. Yalnız son parça silinebilir (`sourceLockedUnit`).
    */
    const lastUnitOnly = runtimeFinalReadSourceProvenance.has(
      action.provenance?.evidenceType ?? "",
    );
    if (!quotesUnambiguous(body)) return [];
    // Ciddi suç isnadı taşıyan entry son okumaya hiç girmez (Sol 6.1, 4. tur).
    if (textContainsSeriousCrimeMarker(body)) return [];
    const title =
      action.actionType === "CREATE_TOPIC_WITH_ENTRY"
        ? action.input.title
        : typeof action.input.topicId === "string"
          ? topicTitles.get(action.input.topicId)
          : undefined;
    const units = runtimeFinalReadUnits(body);
    return units.length < 2
      ? []
      : [
          {
            sequence: action.sequence,
            topicTitle: typeof title === "string" ? title : "",
            body,
            units,
            lastUnitOnly,
            createsTopic: action.actionType === "CREATE_TOPIC_WITH_ENTRY",
            ownRecentBodies,
            topicOtherBodies: topicOtherBodies(action.input.topicId),
          },
        ];
  });
}

/** Son okumanın kurduğu gövdeleri karara yazar; diğer alanlar aynen kalır. */
export function applyRuntimeFinalReadBodies(
  decision: RuntimeDecision,
  bodies: ReadonlyMap<number, string>,
): RuntimeDecision {
  if (bodies.size === 0) return decision;
  return {
    ...decision,
    actions: decision.actions.map((action) => {
      const body = bodies.get(action.sequence);
      return body === undefined ? action : { ...action, input: { ...action.input, body } };
    }),
  };
}
