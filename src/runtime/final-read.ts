import { z } from "zod";
import {
  constitutionalEntryWritingIssue,
  constitutionalTopicCreationIssue,
} from "@/lib/content/constitution-writing-policy";
import {
  hasUnrecordedOfflineFirstPersonClaim,
  repeatedEntryFraming,
  textContainsSeriousClaimMarker,
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

  Korumalar deterministiktir: ilk parça, soru, bağlantı, alıntı, URL, doğruluk çekincesi, atıf,
  nedensellik ve kapsam sınırı taşıyan parça silinmez; kaynaklı, ciddi iddialı ve sağlık/finans/hukuk
  gövdesi hiç kısaltılmaz; bütün
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
  /** Yeni başlık açan entry: başlık anayasası gövdeyle birlikte denetlenir. */
  createsTopic: boolean;
  /** Kapanış çakışması karşılaştırması için algıdaki kendi son entry'leri ve başlıktaki diğerleri. */
  ownRecentBodies: string[];
  topicOtherBodies: string[];
};

export type RuntimeFinalReadContext = Partial<
  Pick<
    RuntimeFinalReadCandidate,
    "createsTopic" | "topicTitle" | "ownRecentBodies" | "topicOtherBodies"
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
  Silme, sunucunun gövdeye bakan ilke kontrollerinde yeni bir ihlal açmamalı (Sol 6.1): "…rüşvet
  aldı; ancak bu iddia henüz doğrulanmadı." gövdesinden çekince silinince ciddi iddia güçlü kanıt
  ister hâle geliyordu. Karşılaştırma tek yönlüdür (Fable, 10 Ekim): silmeden sonraki ihlaller
  silmeden öncekilerin alt kümesi olmalı. Tekrar eden bir kapanışı silen, yani düzelten silme
  kabul edilir; yeni bir ihlal açan silme reddedilir.

  - Çekincesiz ciddi iddia cümleleri cümle bazında karşılaştırılır.
  - Yeni başlıkta başlık anayasası gövdeyle birlikte denetlenir.
  - Kapanış tekrarı, algıdaki kendi ve başlık entry'leriyle önce ve sonra ayrı ayrı denetlenir.
*/
function policyViolations(body: string, context: RuntimeFinalReadContext): Set<string> {
  const violations = new Set<string>();
  if (userEntryContainsHighRiskReproduction(body)) violations.add("reproduction");
  if (hasUnrecordedOfflineFirstPersonClaim(body)) violations.add("offline-claim");
  const entryIssue = constitutionalEntryWritingIssue(body)?.code;
  if (entryIssue) violations.add(`entry:${entryIssue}`);
  if (context.createsTopic) {
    const topicIssue = constitutionalTopicCreationIssue(context.topicTitle ?? "", body)?.code;
    if (topicIssue) violations.add(`topic:${topicIssue}`);
  }
  const framing = repeatedEntryFraming(
    body,
    context.ownRecentBodies ?? [],
    context.topicOtherBodies ?? [],
  );
  if (framing) violations.add(`framing:${framing.edge}:${framing.scope}`);
  for (const sentence of unframedSeriousClaimSentences(body)) violations.add(`serious:${sentence}`);
  return violations;
}

function policyPreserved(before: string, after: string, context: RuntimeFinalReadContext): boolean {
  const previous = policyViolations(before, context);
  return [...policyViolations(after, context)].every((violation) => previous.has(violation));
}

function protectedRanges(body: string): Array<[number, number]> {
  return [...body.matchAll(protectedSpan)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
}

/*
  Türkçe kısaltmalardan sonraki nokta parçayı bölmez (Fable, 10 Ekim): "vb.", "örn.", "prof.",
  "a.ş." cümle ortasında geçer; bölünürse model yarım cümleyi silebilirdi.
*/
const abbreviationBeforeBoundary =
  /(?:^|[^\p{L}])(?:vb|vs|vd|örn|bkz|prof|doç|dr|yrd|av|müh|sn|no|nr|s|sf|yy|st|mah|cad|sok|ltd|şti|a\.ş|m\.ö|m\.s|i\.ö|i\.s|ör|krş|bşk|gen|mad|fık|tic|san)\.$/iu;

export function runtimeFinalReadUnits(body: string): RuntimeFinalReadUnit[] {
  const ranges = protectedRanges(body);
  const units: RuntimeFinalReadUnit[] = [];
  let position = 0;
  for (const match of body.matchAll(unitBoundary)) {
    if (ranges.some(([start, end]) => match.index > start && match.index < end)) continue;
    // Paragraf sınırı her zaman böler; kısaltma istisnası yalnız cümle içindeki boşluktadır (Astra).
    if (
      !match[0].includes("\n") &&
      abbreviationBeforeBoundary.test(body.slice(Math.max(0, match.index - 8), match.index))
    )
      continue;
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
/*
  Sunucunun çekince sözlüğü dar; son okuma ayrıca doğruluk bildiren her parçayı kilitler (Sol 6.1,
  8. tur: "Bu bilgi henüz kesinleşmedi."). Büyük/küçük harf ve Türkçe küçültme fark etmez.
*/
const veracityHedge =
  /(?:^|[^\p{L}])(?:henüz|hâlâ doğrulan|kesinleş|netleş|doğrulan|teyit|onaylanma|iddia|söylenti|rivayet|öne sür)/u;

function containsVeracityHedge(text: string): boolean {
  return [text.toLocaleLowerCase("tr-TR"), text.toLowerCase()].some((lower) =>
    veracityHedge.test(lower),
  );
}

/*
  Anlam koruması (Astra DD-03, 10 Ekim). Silme sözcük eklemese de iddiayı güçlendirebilir:

  - görüşün sahibini veren atıf cümlesi ("bunu savunan kişi …", "… göre");
  - nedensellik ya da korelasyon çekincesi;
  - kapsam sınırı ("bütün müzeler için geçerli değil").

  Bu parçalar silinmez. "Tek başına kanıt değildir" türü genel dolgu kilitlenmez; o, son okumanın
  asıl hedefidir.
*/
const meaningGuard =
  /(?:^|[^\p{L}])(?:savun|söyl|diyor|diyen|dedi|belirt|aktar|anlattı|açıkla|göre(?![\p{L}])|diye düşün|nedensel|neden-sonuç|korelasyon|ilişkisel|geçerli|genelle|istisna|sınırlı|kapsamaz|kapsamıyor|her durumda|herkes için değil)/u;

function containsMeaningGuard(text: string): boolean {
  return [text.toLocaleLowerCase("tr-TR"), text.toLowerCase()].some((lower) =>
    meaningGuard.test(lower),
  );
}

function lockedUnit(text: string): boolean {
  return (
    text.includes("?") ||
    protectedRanges(text).length > 0 ||
    textContainsUncertaintyFrame(text) ||
    containsVeracityHedge(text) ||
    containsMeaningGuard(text)
  );
}

/*
  Sağlık, finans ve hukuk gövdeleri son okumaya girmez (Astra DD-03): bu alanlarda bir çekincenin
  ya da kapsam cümlesinin silinmesi, okura güvenilir öneri gibi görünen bir hüküm bırakabilir.
*/
const sensitiveDomain =
  /(?:^|[^\p{L}])(?:sağlık|hastal|hastane|hasta(?!n\p{L}*\s+(?:taraftar|seyirci))|tedavi|ilaç|kanser|kalp|diyabet|tansiyon|aşı(?!r)|bağışıklı|enfeksiyon|virüs|bakteri|ameliyat|semptom|doktor|hekim|teşhis|tanı(?:sı|sını|ya|da|nın|\s|$)|doz(?:u|a|lar|aj|\s|$)|beslenme|diyet|takviye|vitamin|gebelik|hamile|ruh sağlı|depresyon|intihar|psikiyatr|ölüm riski|yatırım|borsa|hisse(?!t)|hissedar|kripto|faiz|kredi|borç|vergi|emeklilik|sigorta|anapara|döviz|altın fiyat|hukuk|dava|mahkeme|avukat|kanun|yasal|suç|ceza|tahliye|kiracı|icra|haciz|tazminat|sözleşme)/u;

function inSensitiveDomain(text: string): boolean {
  return [text.toLocaleLowerCase("tr-TR"), text.toLowerCase()].some((lower) =>
    sensitiveDomain.test(lower),
  );
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
  context: RuntimeFinalReadContext = {},
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
      Kaynaklı entry son okumaya girmez (Sol 6.1, 9. tur): "Bu ilişki tek başına nedensellik
      kanıtı değil." gibi bir son cümle, kaynağın kapsamını koruyan gerçek bir uyarı olabilir;
      sunucunun kaynak doğrulaması yalnız sayı ve alıntıya baktığından silinmesini yakalamaz.
    */
    if (runtimeFinalReadSourceProvenance.has(action.provenance?.evidenceType ?? "")) return [];
    if (!quotesUnambiguous(body)) return [];
    /*
      Ciddi suç, güncel olay ya da kişi durumu işareti taşıyan entry son okumaya hiç girmez; çekince
      çerçevesine bakılmaz (Sol 6.1, 4.–6. tur): çekince ayrı cümlede olabilir ("…istifa etti. Bu
      bilgi henüz kesinleşmedi.") ya da aynı cümlede başka anlamda geçen "belirsiz" iddiayı
      çerçevelenmiş gösterebilir. Yerel örneklerde silme yapılan gövdelerin hiçbiri bu sınıfta değildi.
    */
    const title =
      action.actionType === "CREATE_TOPIC_WITH_ENTRY"
        ? action.input.title
        : typeof action.input.topicId === "string"
          ? topicTitles.get(action.input.topicId)
          : undefined;
    if (
      textContainsSeriousClaimMarker(body) ||
      inSensitiveDomain(body) ||
      (typeof title === "string" && inSensitiveDomain(title))
    )
      return [];
    const units = runtimeFinalReadUnits(body);
    return units.length < 2
      ? []
      : [
          {
            sequence: action.sequence,
            topicTitle: typeof title === "string" ? title : "",
            body,
            units,
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
