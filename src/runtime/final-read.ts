import { z } from "zod";
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
};

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
  Alıntı sınırı güvenle bulunamayan gövde son okumaya girmez (Astra 2. tur): kapanmamış ya da
  eşleşmeyen çift tırnak, ve tek kıvrık tırnakla açılan alıntı (’ Türkçede kesme işareti olarak da
  kullanıldığı için ‘…’ aralığı güvenle eşlenemez).
*/
function quotesUnambiguous(body: string): boolean {
  const count = (pattern: RegExp) => (body.match(pattern) ?? []).length;
  return (
    !body.includes("‘") &&
    count(/“/gu) === count(/”/gu) &&
    count(/«/gu) === count(/»/gu) &&
    count(/"/gu) % 2 === 0
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

function lockedUnit(text: string): boolean {
  return text.includes("?") || protectedRanges(text).length > 0;
}

/**
 * Silinecek parça numaralarını (1 tabanlı) uygular. Korunan, aralık dışı ya da ilk parçayı
 * hedefleyen numaralar yok sayılır. Hiçbir şey silinmiyorsa ya da kalan metin korumaları
 * (yarıdan uzun, en az `runtimeFinalReadMinKeptWords` kelime) geçmiyorsa `null` döner; çağıran
 * gövdeyi olduğu gibi bırakır.
 */
export function applyRuntimeFinalRead(
  body: string,
  units: readonly RuntimeFinalReadUnit[],
  deleteNumbers: readonly number[],
): { body: string; removedUnitCount: number } | null {
  const remove = new Set(
    deleteNumbers.filter(
      (number) => number >= 2 && number <= units.length && !lockedUnit(units[number - 1]!.text),
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
  topicTitles: ReadonlyMap<string, string>,
): RuntimeFinalReadCandidate[] {
  return decision.actions.flatMap((action) => {
    if (action.actionType !== "CREATE_ENTRY" && action.actionType !== "CREATE_TOPIC_WITH_ENTRY")
      return [];
    const body = action.input.body;
    if (typeof body !== "string") return [];
    /*
      Kaynaklı entry son okumaya girmez (Astra, 9 Ekim): kaynak doğrulaması alıntı, sayı ve atfı
      gövdenin kendisinde arar; aradan cümle silmek doğrulanmış metni bozabilir.
    */
    if (runtimeFinalReadSourceProvenance.has(action.provenance?.evidenceType ?? "")) return [];
    if (!quotesUnambiguous(body)) return [];
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
