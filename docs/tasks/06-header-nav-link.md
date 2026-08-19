# 06 · Header navigasyonunu gerçek linke çevir

**Plan kalemi:** P0-2 · **Boyut:** M · **Ön koşul:** görev 01+02 (yeni aktif durum stili doğru tokenı kullansın)

## Bağlam

`src/components/layout/site-shell.tsx` içinde `<nav aria-label="Ana menü">` var ama içeriği karışık:

- "Son", "Gündem", "Yeni" → `<button>`, **hiçbir yere gitmiyorlar**; sidebar'ın feed'ini değiştiriyorlar
- "DEBE" → gerçek `<a href="/debe">`

Sonuç canlıda doğrulandı: `/gundem` sayfasındayken header'daki **"Son"** `aria-pressed="true"`
görünüyor, "Gündem" `false`. Kullanıcı bulunduğu sayfayı header'dan okuyamıyor.

`/son`, `/gundem`, `/yeni` sayfaları **zaten var ve çalışıyor** — ama yalnız footer'dan erişilebiliyor.

**Benchmark dayanağı:** Ekşi'de `#quick-index-nav` öğelerinin hepsi gerçek `<a href>`
(`/basliklar/gundem`, `/debe`, `/basliklar/kanal/spor`). Normal Sözlük'te `#categories`
öğelerinin hepsi gerçek link (`/basliklar/akis`, `/basliklar/category/gundem`). İkisinde de
istisnasız sayfa navigasyonu.

## Okunacak dosyalar

- `src/components/layout/site-shell.tsx` — özellikle 28-49 (`topicIndexes` sabiti), 235-238
  (`selectIndexFeed`), 339-361 (header nav)
- `src/app/son/page.tsx`, `src/app/gundem/page.tsx`, `src/app/yeni/page.tsx` — hedef rotaların var olduğunu teyit edin

## Yapılacak

1. Header'daki üç `<button>`'u `next/link` `<Link>`'e çevirin:
   | Etiket | href |
   |---|---|
   | Son | `/son` |
   | Gündem | `/gundem` |
   | Yeni | `/yeni` |
2. `aria-pressed` yerine `usePathname()` ile `aria-current="page"` kullanın.
   `usePathname` bu dosyada zaten import edilmiş durumda (`TopicNavigation` kullanıyor).
3. Aktif stil aynı kalsın (`bg-page text-ink`), yalnız hangi öğeye uygulandığı `pathname`'den gelsin.
4. DEBE zaten `<Link>` — ona da aynı `aria-current` mantığını uygulayın.
5. Bu görevde `selectIndexFeed` **henüz silinmiyor** — sidebar hâlâ kullanıyor. Yalnız header
   artık onu çağırmayacak. Temizlik görev 07'de.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e   # header selektörleri değişti, kırılanları güncelleyin
```

Elle: `/gundem`'e gidin, header'da "Gündem" öğesinin `aria-current="page"` taşıdığını
DevTools'ta doğrulayın. Sağ tık → "yeni sekmede aç" çalışmalı.

## Bitti kriteri

- [ ] Header'daki dört öğe de gerçek `<a href>`
- [ ] `/son`, `/gundem`, `/yeni`, `/debe` sayfalarında doğru öğe `aria-current="page"`
- [ ] Orta tık / Cmd+tık yeni sekmede açıyor
- [ ] `tests/e2e/` içindeki kırılan selektörler güncellendi

## Dokunmayın

- Sidebar'ın kendi `TopicIndexControls`'u — görev 07'de kaldırılacak
- Mobil drawer davranışı — görev 08'de
