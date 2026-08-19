# 17 · Entry kartı footer'ını birleştir, puanı tekilleştir

**Plan kalemi:** P2-17 · **Boyut:** M · **Ön koşul:** görev 15 ve 16 bitmiş olmalı

## Bağlam

Entry kartında **iki ayrı çizgili blok** üst üste duruyor:

- `entry-preview.tsx:66` — footer: `mt-5 ... border-t pt-4`, içinde "N puan · tarih · yazar"
- `entry-actions.tsx:108` — aksiyon satırı: `mt-4 border-t pt-4`, içinde oy butonları

Ayrıca **puan iki yerde**: footer'daki "N puan" metni ve oy butonları arasındaki sayaç.
Görev 15'ten sonra aksiyon satırı misafirde de göründüğü için bu çift gösterim herkesi etkiliyor.

## Okunacak dosyalar

- `src/components/entries/entry-preview.tsx:43-107` — kart yapısı
- `src/components/entries/entry-actions.tsx:107-115` — aksiyon satırı sarmalayıcısı

## Yapılacak

1. **Tek footer bloğu.** `EntryActions`'tan `mt-4 border-t pt-4` sarmalayıcısını kaldırın;
   `EntryPreview`'ın footer'ının içine yerleşsin.
2. Düzen:
   - **Sol:** aksiyonlar (oy butonları, skor, favori + sayaç, diğerleri)
   - **Sağ:** tarih (kalıcı link) + "düzenlendi" + yazar
   - 375px'te sağ grup alt satıra insin (`flex-wrap`), ama iki ayrı çizgi oluşmasın
3. **Puanı tekilleştirin.** `entry-preview.tsx:67`'deki `<span>{entry.score} puan</span>`
   kaldırılsın. Tek kaynak `entry-actions.tsx:120`'deki sayaç.
4. Aksiyon satırı 375px'te taşmasın. Görev 18 buraya bir buton daha ekleyecek; şu an
   oturum açmış kullanıcıda 8'e kadar öğe olabiliyor. **İkincil aksiyonları bir "diğer" (⋮)
   menüsüne alın** — düzenle, sil, sürümler, gammaz, yazarı engelle.
   Görünür kalacaklar: oy +, skor, oy −, favori + sayaç.
   Normal Sözlük tam olarak bu deseni kullanıyor (aksiyon satırı + `⋮` açılır menü).
   Menü için Radix `DropdownMenu` (projede zaten var — `account-menu.tsx`).

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

375px'te:
```js
// entry kartında yatay çizgi sayısı
[...document.querySelectorAll('article .border-t')].length   // kart başına 1
// "puan" kelimesi kartta bir kez geçmeli
```

Klavye: ⋮ menüsü Tab ile ulaşılabilir, ok tuşlarıyla gezilebilir, Esc kapatıyor olmalı.

## Bitti kriteri

- [ ] Kart başına tek yatay ayraç
- [ ] Puan tek yerde
- [ ] 375px'te aksiyon satırı tek satırda kalıyor, sarmıyor
- [ ] ⋮ menüsündeki aksiyonlar klavyeyle erişilebilir
- [ ] Misafirde ⋮ menüsü ya boş olduğu için hiç görünmüyor ya da yalnız dolu geliyor

## Dokunmayın

- Aksiyonların işlevi — yalnız yerleşim ve gruplama değişiyor
- `EntryBody`
