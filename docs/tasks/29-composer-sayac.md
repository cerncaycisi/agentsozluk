# 29 · Composer'a karakter sayacı ve `maxLength`

**Plan kalemi:** P2-13 · **Boyut:** S · **Ön koşul:** yok

## Bağlam

Entry yazma formu (`create-entry-form.tsx`) `maxLength` **taşımıyor**:

```tsx
{...register("body", {
  required: "Entry metni zorunludur.",
  minLength: { value: 10, message: "En az 10 karakter girin." },
})}
```

Oysa düzenleme textarea'sı (`entry-actions.tsx:225`) `maxLength={10000}` kullanıyor.
Tutarsızlık: kullanıcı 12.000 karakter yazabiliyor, sunucu reddediyor, emeği çöpe gidiyor.

Ayrıca hiçbir textarea'da karakter sayacı yok.

## Okunacak dosyalar

- `src/components/entries/create-entry-form.tsx` — tamamı (58 satır)
- `src/components/entries/entry-actions.tsx:215-243` — düzenleme textarea'sı, `maxLength={10000}`
- `src/components/ui/form-field.tsx` — `FormTextarea`
- Sunucudaki gerçek sınırı teyit edin:
  ```bash
  grep -rn "10000\|max(" src/modules/entries/validation/
  ```

## Yapılacak

1. `FormTextarea`'ya sayaç ekleyin — yalnız `maxLength` prop'u verildiğinde görünsün.
   - Konum: textarea'nın altı, sağa hizalı, `text-xs text-muted`
   - Biçim: `1.234 / 10.000`
   - `aria-live="polite"`, ama **her tuş vuruşunda duyurmasın** — yalnız son %10'a
     girildiğinde duyurulsun, yoksa ekran okuyucu kullanıcısını boğar
   - Son %10'da `text-destructive`
2. `create-entry-form.tsx`'e `maxLength: 10000` ekleyin — hem `register` doğrulamasına
   hem textarea'nın `maxLength` özniteliğine.
   **Sunucudaki gerçek sınırı doğrulayın**, 10000'i varsayım olarak almayın.
3. Sayacı düzenleme textarea'sında da gösterin (`entry-actions.tsx`) — `FormTextarea`'yı
   orada kullanmıyorsa ya ona geçirin ya da aynı sayaç bileşenini paylaştırın.
   İki ayrı sayaç uygulaması yazmayın.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Elle: 9.900 karakter yapıştırın → sayaç kırmızıya dönüyor mu; 10.001 yazmayı deneyin →
tarayıcı engelliyor mu; sunucuya giden istek olmadan durduruluyor mu.

## Bitti kriteri

- [ ] Yeni entry ve düzenleme formlarının ikisinde de aynı sınır geçerli
- [ ] Sayaç çalışıyor, son %10'da uyarı rengi
- [ ] Sınır sunucudaki gerçek değerle eşleşiyor (doğrulandı, varsayılmadı)
- [ ] Ekran okuyucu her karakterde konuşmuyor

## Dokunmayın

- `minLength: 10` davranışı
- Sunucu tarafı doğrulama — yalnız istemciyi ona **hizalıyorsunuz**
