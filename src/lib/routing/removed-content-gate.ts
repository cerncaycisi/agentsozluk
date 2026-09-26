import {
  hasLegacyIdPrefix,
  nextRouteParamSegment,
  parseEntryRouteReference,
  parseTopicRouteReference,
} from "@/lib/routing/public-urls";

/*
  Great reset sonrası eski adres kapısı (üretim tasarımı v18 madde 4; Gökhan kararı, 26 Eylül
  2026: "Yalnız bilinen silinmişe 410").

  Önce metot ve URL SÖZDİZİMİ sınıflandırılır, veritabanına dokunulmaz: yalnız GET/HEAD ve
  `/baslik/{slug}--{id}`, `/entry/{id}` ya da legacy UUID biçimindeki tek segment aday olur.
  POST (eski sekmenin Server Action'ı dahil), yalın `/baslik/{kodlanmış başlık}` yazma formu,
  yeni namespace (`> 2147483647`) ve ayrıştırılamayan yol aday değildir.

  Segment, sayfanın `params` olarak gördüğü biçime getirilerek ayrıştırılır: Next.js 15.5 dinamik
  segmenti çözüp yeniden kodlar (Astra, PR #229: `%2D` → `-`, `%37` → `7`; `%C3%A7` kodlu kalır).
  Kapı ile sayfa farklı kimlik seçerse canlı adrese 410 ya da silinmiş adrese içerik düşebilirdi.
  Bozuk yüzde dizisi aday değildir; sayfa da onu geçersiz adres sayar.

  Kabul edilen sınır (Astra, PR #229 3. tur): Next adaptörü URL sonundaki `.rsc`'yi middleware'den
  önce siler, sayfa ise literal `/entry/7.rsc` isteğinde `7.rsc` görür. Middleware orijinal adresi
  göremez; 7 mezar taşındaysa bu hiçbir içeriğe ait olmayan adres 404 yerine 410 alır. Sayfanın
  `.rsc`'li segmentte başka bir kimlik seçebildiği tek biçim UUID öneki + `--sayı`dır: o adayda
  UUID de `alternate` olarak taşınır ve canlıysa 410 verilmez (aşağı bkz.).
*/

const LEGACY_PUBLIC_ID_MAX = 2_147_483_647;
const GATED_PATH = /^\/(baslik|entry)\/([^/]+)$/u;

type RemovedContentKind = "TOPIC" | "ENTRY";
type RemovedContentReference = { publicId: number } | { contentId: string };

export type RemovedContentCandidate = {
  kind: RemovedContentKind;
  reference: RemovedContentReference;
  /** Segmentin ikinci olası yorumu; birincil kimlik silinmiş olsa da bu canlıysa 410 verilmez. */
  alternate?: RemovedContentReference;
};

export function removedContentCandidate(
  method: string,
  pathname: string,
): RemovedContentCandidate | null {
  if (method !== "GET" && method !== "HEAD") return null;
  const match = GATED_PATH.exec(pathname);
  if (!match?.[1] || !match[2]) return null;
  const kind: RemovedContentKind = match[1] === "baslik" ? "TOPIC" : "ENTRY";
  const segment = nextRouteParamSegment(match[2]);
  if (!segment) return null;
  const reference =
    kind === "TOPIC" ? parseTopicRouteReference(segment) : parseEntryRouteReference(segment);
  if (!reference) return null;
  if (reference.kind === "legacy") return { kind, reference: { contentId: reference.id } };
  if (reference.publicId < 1 || reference.publicId > LEGACY_PUBLIC_ID_MAX) return null;
  /*
    Hem UUID öneki hem `--sayı` soneki taşıyan başlık segmenti iki kimliğe okunabilir: `.rsc`'siz
    istekte sayfa sayıyı, literal `.rsc`'de UUID'yi seçer; middleware `.rsc`'yi göremez (Astra,
    PR #229 4. tur). Bu biçim kanonik adreste de olabilir (UUID'ye benzeyen başlık slug'ı; 5. tur).
    Sayısal kimlik mezar taşındaysa UUID ayrıca sorulur; canlıysa 410 verilmez.
  */
  const alternate =
    kind === "TOPIC" && hasLegacyIdPrefix(segment)
      ? { contentId: segment.slice(0, 36).toLowerCase() }
      : undefined;
  return {
    kind,
    reference: { publicId: reference.publicId },
    ...(alternate ? { alternate } : {}),
  };
}

const GONE_BODY = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Bu içerik kaldırıldı</title></head>
<body><main><h1>Bu içerik kaldırıldı</h1><p>Aradığınız sayfa sözlüğün sıfırlanmasıyla kalıcı olarak kaldırıldı.</p><p><a href="/">Ana sayfaya dön</a></p></main></body>
</html>
`;

const UNAVAILABLE_BODY = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Geçici olarak kullanılamıyor</title></head>
<body><main><h1>Geçici olarak kullanılamıyor</h1><p>Lütfen biraz sonra yeniden deneyin.</p></main></body>
</html>
`;

/**
 * Statik, betiksiz yanıt. `no-store`: rollback sonrası tarayıcı ya da proxy bayat 410
 * saklamaz. HEAD aynı statü ve başlıkları gövdesiz taşır.
 */
function staticResponse(
  status: 410 | 503,
  body: string,
  method: string,
  contentSecurityPolicy: string,
): Response {
  return new Response(method === "HEAD" ? null : body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy": contentSecurityPolicy,
    },
  });
}

export function goneResponse(method: string, contentSecurityPolicy: string): Response {
  return staticResponse(410, GONE_BODY, method, contentSecurityPolicy);
}

/** Karar sorgusu hata verirse 410 uydurulmaz; yalnız ilgili eski yol 503 alır. */
export function removedContentUnavailableResponse(
  method: string,
  contentSecurityPolicy: string,
): Response {
  return staticResponse(503, UNAVAILABLE_BODY, method, contentSecurityPolicy);
}
