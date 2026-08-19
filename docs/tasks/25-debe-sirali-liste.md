# 25 · DEBE'yi sıralı listeye çevir

**Plan kalemi:** P2-19 · **Boyut:** XS · **Ön koşul:** yok

## Bağlam

`src/app/debe/page.tsx` "Dünün en beğenilen entry'leri"ni numarasız bir `<div>` yığını olarak
gösteriyor. DEBE bir **sıralama** — 1'den N'e. Hangi güne ait olduğu da yazmıyor
(yalnız açıklamada "dün" geçiyor, tarih yok).

## Okunacak dosyalar

- `src/app/debe/page.tsx` — tamamı (37 satır)
- `src/lib/format/time.ts` — `formatIstanbulDate`
- `src/modules/feeds/application/feeds.ts` — `getDebe`, sıranın zaten puana göre geldiğini teyit edin

## Yapılacak

1. `<div className="space-y-4">` → `<ol className="space-y-4">`, her entry bir `<li>`.
2. Her karta sıra numarası rozeti: `#1`, `#2`, … **375px'te rozeti kartın soluna koymayın** —
   sol oluk kart genişliğini ~40px daraltır ve entry metin sütunu zaten dar (301px, ~38 karakter/satır).
   Mobilde kartın üstünde, `sm:` ve üzerinde solda dursun. Renk:
   `text-accent-contrast text-sm font-bold` (bu sınıf projede kontrast için özel olarak var).
3. Başlığa günü ekleyin: `getDebe`'nin hangi güne baktığını bulun ve `formatIstanbulDate` ile
   yazdırın — "Dünün en beğenilen entry'leri" başlığının altına "18 Ağustos 2026" gibi.
   Günü **sunucuda** hesaplayın; `getDebe` zaten Europe/Istanbul takvimine göre çalışıyor,
   aynı kaynağı kullanın, ikinci bir `new Date()` çağırmayın.
4. Numara rozeti entry'nin kalıcı adresine link olsun.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Elle: `/debe`'de numaralar 1'den başlıyor mu, sıralı mı, tarih doğru mu (dün olmalı).

## Bitti kriteri

- [ ] Sıra numaraları görünüyor, 1'den başlıyor
- [ ] Hangi güne ait olduğu yazıyor
- [ ] Semantik olarak `<ol>` kullanılıyor
- [ ] Boş durum mesajı hâlâ çalışıyor

## Dokunmayın

- `getDebe`'nin seçim mantığı
- `EntryPreview` — görev 13 buraya `collapsible` ekliyor olabilir, çakışmayın
