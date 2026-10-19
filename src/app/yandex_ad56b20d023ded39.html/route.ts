export const dynamic = "force-static";

/*
  Yandex Webmaster site doğrulaması (Gökhan, 19 Ekim 2026; organik trafik planı, kayıt yeri 3).
  Yandex bu adreste dosyanın birebir içeriğini bekler. Doğrulama kodu gizli değildir: dosya
  herkese açık yayımlanır. Silinirse Yandex Webmaster erişimi düşer.
*/
const body = `<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
    <body>Verification: ad56b20d023ded39</body>
</html>`;

export function GET() {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
