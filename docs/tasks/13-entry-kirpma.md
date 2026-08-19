# 13 · Akışlarda uzun entry'leri kırp

**Plan kalemi:** P1-12 · **Boyut:** M · **Ön koşul:** yok
**⚠ Bu görev, görev 24'ün (ana sayfa) ön koşuludur — sırayı bozmayın.**

## Bağlam

`src/components/entries/entry-preview.tsx:63` entry gövdesini her yerde **tam** render ediyor.
`/debe`, `/yazar/*` ve (görev 24'ten sonra) ana sayfa gibi akış bağlamlarında tek bir uzun
entry ekranı doldurabiliyor.

**Benchmark:** Normal Sözlük `.entrybody_readmore` + `.entry_readmore` ile kırpıp
"devamını gör…" gösteriyor.

## Okunacak dosyalar

- `src/components/entries/entry-preview.tsx` — özellikle 24-40 (props) ve 59-65 (gövde)
- `src/components/entries/entry-body.tsx` — `whitespace-pre-wrap break-words leading-7`
- Kullanım yerleri: `src/app/debe/page.tsx:31`, `src/app/yazar/[username]/page.tsx`,
  `src/app/baslik/[topic]/page.tsx:306`

## Yapılacak

1. `EntryPreview`'a `collapsible?: boolean` prop'u ekleyin, varsayılan `false`.
2. `collapsible` ise gövdeyi kırpın:
   - Sarmalayıcıya `max-h-56 overflow-hidden` (~8 satır, `leading-7` = 28px satır yüksekliği)
   - Altına alt kenara doğru solan bir gradyan maskesi (`bg-gradient-to-t from-surface`)
   - Altında "Devamını göster" butonu
3. **Kritik:** Kırpma yalnız **görsel** olacak. Metnin tamamı DOM'da kalacak — CSS ile gizlenecek,
   JS ile kesilmeyecek. SEO ve ekran okuyucu için gerekli.
4. Buton içeriği genişletsin (`max-h` kaldırılır). Genişletilmiş durumda "Daha az göster"
   sunmak zorunda değilsiniz; ama sunarsanız `aria-expanded` kullanın.
5. Metin zaten eşiğin altındaysa ne maske ne buton görünsün. Bunu **CSS ile** çözün
   (`max-h` uygulanınca kırpılmayan içerik zaten taşmaz); gövde uzunluğunu JS ile ölçmeye
   çalışmak hidrasyon uyuşmazlığı riski taşır. Sunucuda karakter sayısına bakmak (örn. >600)
   kabul edilebilir bir yaklaşımdır.
6. `collapsible={true}` verilecek yerler: `/debe`, `/yazar/[username]`.
   **`/baslik/[topic]` sayfasında verilmeyecek** — başlık sayfasında entry'ler tam okunur.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Elle:

- `/debe`'de hiçbir entry kartı 400px'i geçmemeli
- JS'i kapatın → metnin tamamı sayfada olmalı (kırpık görünse de `Ctrl+F` ile bulunabilmeli)
- Bir başlık sayfası açın → entry'ler tam görünmeli, kırpılmamalı

## Bitti kriteri

- [ ] `/debe`'de kart yüksekliği ≤400px
- [ ] Genişletme çalışıyor
- [ ] JS kapalıyken metnin tamamı DOM'da
- [ ] Başlık sayfasında davranış değişmedi
- [ ] Koyu temada gradyan maskesi doğru renk (`from-surface`, sabit beyaz değil)

## Dokunmayın

- `EntryBody`'nin tokenizasyon mantığı
- Entry aksiyonları
