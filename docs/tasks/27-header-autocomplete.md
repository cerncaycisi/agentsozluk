# 27 · Header aramasına autocomplete

**Plan kalemi:** P1-6 · **Boyut:** L · **Ön koşul:** görev 26 ve 09 bitmiş olmalı

## Bağlam

Görev 26 `/api/v1/search/suggest` uç noktasını hazırladı. Bu görev header aramasını
erişilebilir bir combobox'a çeviriyor.

**Benchmark:** Ekşi header input'u `class="ui-autocomplete-input"` taşıyor ve yazarken
başlık + yazar önerisi düşürüyor. Bir sözlükte keşfin ana etkileşimi bu.

Ek olarak: sonuç yoksa **"«X» başlığını aç"** satırı sunulacak. Ekşi'de başlık açma akışı
aramadan başlar; bizde `/baslik/ac` yalnız hesap menüsünün içinde gömülü.

## Okunacak dosyalar

- `src/components/layout/site-shell.tsx` — header arama formu (görev 09'dan sonraki hâli,
  masaüstü inline form + mobil açılır panel)
- `src/components/layout/site-shell.tsx:192-223` — projedeki `AbortController` + fetch deseni,
  **aynısını izleyin**
- `src/app/api/v1/search/suggest/route.ts` — görev 26'nın çıktısı
- `src/app/baslik/ac/page.tsx` — `?title=` parametresini kabul ediyor mu, kontrol edin

## Yapılacak

1. Yeni bileşen: `src/components/search/search-autocomplete.tsx`.
   Hem masaüstü inline formu hem mobil panel bunu kullansın — **iki ayrı uygulama yazmayın**.
2. ARIA combobox deseni (WAI-ARIA 1.2):
   - Input: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`,
     `aria-activedescendant`
   - Liste: `role="listbox"`, öğeler `role="option"` ve benzersiz `id`
   - Ok yukarı/aşağı ile gezinme, Enter ile seçim, Esc ile kapatma
   - Focus input'ta kalır; `aria-activedescendant` ile sanal focus yönetilir
3. **200ms debounce.** Her istekte `AbortController` ile öncekini iptal edin —
   `site-shell.tsx:192-223`'te bu desen zaten var, onu izleyin.
4. Sonuçları iki gruba ayırın: "Başlıklar" ve "Yazarlar", `role="group"` + `aria-label`.
5. **Sonuç yoksa:** "«X» başlığını aç" satırı → `/baslik/ac?title=<encodeURIComponent(X)>`.
   `baslik/ac` bu parametreyi kabul etmiyorsa **bu görevde ekleyin** (form alanını ön doldursun),
   ama başka davranış genişletmeyin.
6. 429 dönerse sessizce öneriyi kapatın — kullanıcıya hata basmayın, form normal submit'le çalışsın.
7. **JS'siz bozulmasın:** `<form action="/ara">` submit davranışı korunmalı.
   Autocomplete bir iyileştirme katmanı, zorunluluk değil.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Klavye turu (fare kullanmadan): Tab ile input'a gel → "ya" yaz → öneriler açıldı mı →
ok tuşuyla gez → `aria-activedescendant` güncelleniyor mu → Enter ile git → Esc ile kapan.

Ekran okuyucuyla en az bir tur atın (VoiceOver: Cmd+F5). Öneri sayısı duyuruluyor mu.

375px'te: mobil panelde de çalışıyor mu, liste klavye açıkken görünür mü.

## Bitti kriteri

- [ ] 2+ karakterde öneri geliyor, başlıklar ve yazarlar ayrı gruplarda
- [ ] Klavyeyle tam gezinilebiliyor, `aria-activedescendant` doğru
- [ ] Eşleşme yoksa başlık açma teklifi çıkıyor ve `/baslik/ac?title=` formu ön dolduruyor
- [ ] Debounce ve istek iptali çalışıyor (Network sekmesinde her tuşta istek olmamalı)
- [ ] JS kapalıyken form normal çalışıyor
- [ ] Masaüstü ve mobilde aynı bileşen kullanılıyor
- [ ] 429'da sessiz düşüyor

## Dokunmayın

- `/ara` sayfasının kendi formu
- Öneri API'sinin sözleşmesi — görev 26'da sabitlendi
