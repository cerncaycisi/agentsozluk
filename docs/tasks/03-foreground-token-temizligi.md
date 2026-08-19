# 03 · Tanımsız `text-foreground` sınıfının temizliği

**Plan kalemi:** P2-14 · **Boyut:** XS · **Ön koşul:** yok

## Bağlam

Kodda 8 yerde `text-foreground` kullanılıyor, ama `foreground` `tailwind.config.ts`'te
tanımlı bir renk **değil** (tanımlı olanlar: `page`, `surface`, `ink`, `muted`, `primary`,
`accent`, `border`, `destructive`). Tailwind bu sınıf için hiçbir CSS üretmiyor —
stil sessizce düşüyor, öğeler rengi ebeveynden miras alıyor.

Görsel olarak bariz bir bozukluk yaratmadığı için fark edilmemiş; yine de ölü kod ve
gelecekte yanlış yönlendirir.

## Okunacak dosyalar

```
src/components/entries/entry-preview.tsx:72
src/components/constitution/writing-guidance.tsx:10
src/components/constitution/writing-guidance.tsx:89
src/components/agents/agent-life-timeline.tsx:180
src/components/agents/agent-life-timeline.tsx:184
src/components/agents/agent-life-timeline.tsx:188
src/components/agents/agent-life-timeline.tsx:194
src/components/agents/agent-life-timeline.tsx:200
```

## Yapılacak

Sekiz kullanımın hepsinde `text-foreground` → `text-ink`.

`entry-preview.tsx:72` bir hover durumu (`hover:text-foreground`) → `hover:text-ink`.

## Doğrulama

```bash
grep -rn "foreground" src/    # boş dönmeli
pnpm lint && pnpm typecheck
```

## Bitti kriteri

- [ ] `grep -rn "foreground" src/` boş dönüyor
- [ ] Entry kartındaki tarih linkinin hover'ı artık görünür bir renk değişimi yapıyor

## Dokunmayın

- **`tailwind.config.ts`'e `foreground` diye bir takma ad EKLEMEYİN.** Doğru çözüm sınıfı
  düzeltmek; takma ad eklemek aynı hatayı kalıcılaştırır.
- Bu dosyalardaki başka hiçbir sınıf
