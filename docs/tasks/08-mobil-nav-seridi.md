# 08 · Mobil navigasyon şeridi

**Plan kalemi:** P0-3 · **Boyut:** M · **Ön koşul:** görev 06 ve 07 bitmiş olmalı

## Bağlam

`site-shell.tsx:339`'daki ana menü `hidden ... md:flex` — **768px altında hiç görünmüyor**.
375px'te header'da yalnız hamburger, logo, tema ve "Giriş" kalıyor. `/son`, `/gundem`,
`/yeni`, `/debe` sayfalarına mobilden tek erişim yolu footer.

**Benchmark dayanağı (375px'te ikisi de ölçüldü):** Hiçbiri ana navigasyonu hamburger'a saklamıyor.
- **Ekşi:** satır 2 = `gündem · debe · kanallar · giriş · kayıt ol` yatay metin şeridi
- **Normal Sözlük:** satır 2 = `akış · gündem · konular` tam genişlik sekmeler, ~48px yükseklik

## Okunacak dosyalar

- `src/components/layout/site-shell.tsx` — header bloğu (322-392) ve drawer bloğu (465-532)

## Yapılacak

1. Header'ı **iki satıra** ayırın:
   - **Satır 1:** hamburger + logo + (arama yeri — görev 09) + tema + hesap/giriş
   - **Satır 2:** navigasyon şeridi — Son / Gündem / Yeni / DEBE
2. Satır 2 **her genişlikte görünür** olacak. Görev 06'dan gelen `hidden ... md:flex` kalkıyor.
3. Şerit yatay kaydırılabilir olsun, sarmasın:
   ```
   flex items-center gap-1 overflow-x-auto
   ```
   Öğeler `shrink-0` ve **min 44px yükseklik** taşımalı.
   Kaydırma çubuğunu gizleyin ama kaydırmayı bırakın (`scrollbar-width: none` +
   `::-webkit-scrollbar { display: none }` — `globals.css`'e küçük bir yardımcı sınıf).
4. Satır 2 sticky header'ın parçası kalsın (mevcut `sticky top-0 z-50` sarmalayıcının içinde).
5. **Yükseklik bütçesi:** iki satır toplam **≤110px** olmalı. Şu an tek satır `min-h-16` (64px);
   satır 2 için ~44-48px hedefleyin. Aşarsanız satır 1'in `min-h-16`'sını mobilde düşürün.

## Doğrulama

375px'te ölçün (DevTools veya headless):

```js
document.querySelector('header').getBoundingClientRect().height   // ≤ 110
document.querySelector('article')?.getBoundingClientRect().top    // ≤ 250 (şu an 337)
```

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

## Bitti kriteri

- [ ] 375px'te dört navigasyon öğesi de görünür ve **tek dokunuşla** erişilebilir
- [ ] Header yüksekliği 375px'te ≤110px
- [ ] Şerit yatay kayıyor, sarmıyor; sayfa gövdesi yatay kaymıyor
- [ ] Her öğe ≥44px yükseklikte
- [ ] `aria-current="page"` mobilde de doğru çalışıyor

## Dokunmayın

- Arama — görev 09'da eklenecek, şimdilik mevcut `hidden sm:block` davranışı kalsın
- Drawer'ın başlık listesi içeriği
