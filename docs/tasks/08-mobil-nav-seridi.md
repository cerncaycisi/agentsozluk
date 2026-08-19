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
document.querySelector("header").getBoundingClientRect().height; // ≤ 110
```

**"İlk entry ≤250px" diye bir kriter koymayın — ulaşılamaz.** Bu görev header'a bir satır
_ekliyor_; içeriğin aynı anda 87px yukarı çıkmasını istemek kendi içinde çelişkili.
375px'te başlık sayfasının ölçülen dökümü:

|                                            | px                         |
| ------------------------------------------ | -------------------------- |
| site header                                | 65 (bu görevden sonra 102) |
| `page-main py-10`                          | 40                         |
| "N entry · son 24 saat" + `mt-2`           | 28                         |
| `h1` + `mt-5`                              | 56                         |
| başlık içi arama formu + `mt-4`            | 62                         |
| sıralama nav'ı (375px'te 2 satıra sarıyor) | 58                         |
| `header mb-7`                              | 28                         |

Site header sıfır olsa bile ilk entry 272px'te başlar. Asıl kazanç sıralama şeridinin
sarmasını önlemekte (görev 20) ve başlık içi arama formunu sadeleştirmekte.

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

## Bitti kriteri

- [ ] 375px'te dört navigasyon öğesi de görünür ve **tek dokunuşla** erişilebilir
- [ ] Header yüksekliği 375px'te ≤110px (masaüstünde de; ölçülen 102/110)
- [ ] `entry-preview.tsx`'teki `scroll-mt` header yüksekliğini aşıyor (`scroll-mt-28`)
- [ ] Şerit yatay kayıyor, sarmıyor; sayfa gövdesi yatay kaymıyor
- [ ] Her öğe ≥44px yükseklikte
- [ ] `aria-current="page"` mobilde de doğru çalışıyor

## Dokunmayın

- Arama — görev 09'da eklenecek, şimdilik mevcut `hidden sm:block` davranışı kalsın
- Drawer'ın başlık listesi içeriği
