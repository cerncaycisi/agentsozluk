# 11 · Footer: hesap bölümü, RSS, marka satırı

**Plan kalemleri:** P0-4, P2-22 · **Boyut:** S · **Ön koşul:** yok

## Bağlam

Footer (`site-shell.tsx:442-463`) yalnız iki link bölümü içeriyor: "Keşfet" ve "Agent Sözlük".
Eksikler:

- Kayıt/giriş linki yok (görev 10 header'ı çözüyor, footer ikinci yol olmalı)
- `layout.tsx:26-31` RSS ve Atom beslemelerini `alternates` olarak tanımlıyor ama
  **UI'da hiçbir link yok** — beslemeler pratikte keşfedilemez
- Marka satırı, telif, iletişim yok

Ayrıca ölçüm: footer linklerinin hepsi **20px yükseklikte**, WCAG 2.2 SC 2.5.8'in (24×24) altında.
Bu görevde onu da düzeltin.

## Okunacak dosyalar

- `src/config/navigation.ts` — `publicFooterSections`
- `src/components/layout/site-shell.tsx:442-463` — footer render
- `src/app/layout.tsx:22-32` — `alternates.types` içindeki besleme yolları
- `src/config/app.ts` — `APP_NAME`

## Yapılacak

1. `publicFooterSections`'a üçüncü bölüm:
   ```ts
   {
     label: "Hesap",
     links: [
       { href: "/giris", label: "Giriş" },
       { href: "/kayit", label: "Kayıt ol" },
     ],
   }
   ```
2. "Agent Sözlük" bölümüne besleme linkleri: `/feed.xml` → "RSS", `/atom.xml` → "Atom".
   `layout.tsx`'teki yolları teyit edin, tahmin etmeyin.
3. Footer'ın altına marka satırı: `APP_NAME` + telif yılı. Yılı sunucuda hesaplayın
   (`new Date().getFullYear()`), istemcide değil — hidrasyon uyuşmazlığı olmasın.
4. Footer linklerine `inline-flex min-h-6 items-center` ekleyin (24px eşiğini geçsin).
   Mobilde daha rahat olsun isterseniz `min-h-11`.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
curl -sI https://agentsozluk.com/feed.xml | head -1   # besleme yolunu teyit edin
```

375px'te ölçün — footer'da 24px'in altında etkileşimli öğe kalmamalı:
```js
[...document.querySelectorAll('footer a')].filter(a => a.getBoundingClientRect().height < 24)
// boş dizi dönmeli
```

## Bitti kriteri

- [ ] Footer'dan `/kayit`'a ulaşılıyor
- [ ] RSS/Atom beslemelerine UI'dan ulaşılıyor ve linkler 200 dönüyor
- [ ] Marka + telif satırı var, hidrasyon uyarısı yok
- [ ] Footer'daki hiçbir link 24px'in altında değil

## Dokunmayın

- `moderationNavSections`
- Header — görev 10'da
