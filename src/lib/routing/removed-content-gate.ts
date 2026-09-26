import { parseEntryRouteReference, parseTopicRouteReference } from "@/lib/routing/public-urls";

/*
  Great reset sonrası eski adres kapısı (üretim tasarımı v18 madde 4; Gökhan kararı, 26 Eylül
  2026: "Yalnız bilinen silinmişe 410").

  Önce metot ve URL SÖZDİZİMİ sınıflandırılır, veritabanına dokunulmaz: yalnız GET/HEAD ve
  `/baslik/{slug}--{id}`, `/entry/{id}` ya da legacy UUID biçimindeki tek segment aday olur.
  POST (eski sekmenin Server Action'ı dahil), yalın `/baslik/{kodlanmış başlık}` yazma formu,
  yeni namespace (`> 2147483647`) ve ayrıştırılamayan yol aday değildir.

  Segment ham (URL kodlu) hâliyle ayrıştırılır. Kanonik rakam ve UUID adresleri kodlu ve çözülmüş
  biçimde aynıdır; yüzde kodlu bir varyant aday olmaz ve sayfanın normal akışına (404) düşer.
  Belirsizlik yanlış 410 yönünde değil, 404 yönünde çözülür.
*/
const LEGACY_PUBLIC_ID_MAX = 2_147_483_647;
const GATED_PATH = /^\/(baslik|entry)\/([^/]+)$/u;

type RemovedContentKind = "TOPIC" | "ENTRY";
type RemovedContentReference = { publicId: number } | { contentId: string };

export type RemovedContentCandidate = {
  kind: RemovedContentKind;
  reference: RemovedContentReference;
};

export function removedContentCandidate(
  method: string,
  pathname: string,
): RemovedContentCandidate | null {
  if (method !== "GET" && method !== "HEAD") return null;
  const match = GATED_PATH.exec(pathname);
  if (!match?.[1] || !match[2]) return null;
  const kind: RemovedContentKind = match[1] === "baslik" ? "TOPIC" : "ENTRY";
  const reference =
    kind === "TOPIC" ? parseTopicRouteReference(match[2]) : parseEntryRouteReference(match[2]);
  if (!reference) return null;
  if (reference.kind === "legacy") return { kind, reference: { contentId: reference.id } };
  if (reference.publicId < 1 || reference.publicId > LEGACY_PUBLIC_ID_MAX) return null;
  return { kind, reference: { publicId: reference.publicId } };
}

export function isPrefetchRequest(headers: Headers): boolean {
  return headers.has("next-router-prefetch") || headers.get("purpose") === "prefetch";
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
