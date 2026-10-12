import { getEnvironment } from "@/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  IndexNow anahtar dosyası (Gökhan onayı, 12 Ekim 2026; PLAN sıra 4).

  IndexNow'a adres bildiren uygulama DEĞİL: ayrı sunucu betiği (`deploy/indexnow`) site haritasını
  okur ve bildirimi o gönderir. Uygulama üçüncü tarafa istek atmaz. Bu rota yalnız, bildirimin
  bu siteden geldiğini arama motorunun doğrulayabilmesi için anahtarı yayımlar. Anahtar gizli
  değildir ama depoya yazılmaz; üretim ortamında `INDEXNOW_KEY` olarak verilir. Yoksa 404.
*/
export function GET() {
  const key = getEnvironment().INDEXNOW_KEY;
  if (!key) return new Response("Not Found", { status: 404 });
  return new Response(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
