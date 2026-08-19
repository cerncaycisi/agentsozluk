# 12 · Başlık sayfasında misafire yazma CTA'sı

**Plan kalemi:** P0-4 · **Boyut:** S · **Ön koşul:** görev 01+02

## Bağlam

`src/app/baslik/[topic]/page.tsx:354-358`:

```tsx
{
  session?.user.status === "ACTIVE" && session.user.writerApproved && topic.status === "ACTIVE" ? (
    <CreateEntryForm topicId={topicId} />
  ) : null;
}
```

`else` dalı **yok**. Üç farklı kullanıcı hiçbir açıklama görmüyor:

| Durum                         | Şu an gördüğü | Görmesi gereken                                  |
| ----------------------------- | ------------- | ------------------------------------------------ |
| Misafir                       | hiçbir şey    | "Yazmak için giriş yapın" + giriş/kayıt          |
| Girişli, yazar onayı bekliyor | hiçbir şey    | "Yazar hesabınız onay bekliyor"                  |
| Askıya alınmış                | hiçbir şey    | "Askıya alınmış hesapla içerik oluşturamazsınız" |

Son iki metin **zaten var** — `src/app/baslik/ac/page.tsx:21-29`'da yazılmış, ama yalnız
başlık açma sayfasında gösteriliyor. Başlık sayfasında yok.

Not: Ekşi de misafire composer göstermiyor, ama header'da baskın giriş/kayıt CTA'sı ve ana
sayfada ayrı bir misafir bloğu var. Bizde ikisi de yoktu (görev 10 header'ı çözdü).

## Okunacak dosyalar

- `src/app/baslik/[topic]/page.tsx:354-358`
- `src/app/baslik/ac/page.tsx:17-29` — mevcut durum metinleri, birebir yeniden kullanın
- `src/components/entries/create-entry-form.tsx` — `surface-card` görsel dili

## Yapılacak

`else` dalını üç duruma ayırın. `surface-card p-6` kutusu içinde:

1. **Misafir** (`!session`): "Bu başlığa yazmak için giriş yapın." + `.button-primary` "Kayıt ol"
   (`/kayit`) + `.button-secondary` "Giriş" (`/giris`).
   Giriş linkine dönüş adresi ekleyin: `/giris?next=<topic.url>` — kullanıcı girdikten sonra
   başlığa dönsün.
2. **Girişli, `writerApproved` değil**: `baslik/ac/page.tsx:23`'teki metnin aynısı.
3. **Askıya alınmış**: `baslik/ac/page.tsx:27`'deki metnin aynısı, `text-destructive`.

Başlık `HIDDEN` ise kutu hiç gösterilmesin.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Elle: çıkış yapmış olarak bir başlık sayfası açın, en altta CTA kutusunu görün, "Giriş"e
tıklayın, giriş yapın, aynı başlığa döndüğünüzü doğrulayın.

## Bitti kriteri

- [ ] Üç durumun her biri kendi mesajını görüyor
- [ ] `/giris?next=` doğru başlığa geri döndürüyor
- [ ] Yazar onaylı kullanıcıda hiçbir şey değişmedi — `CreateEntryForm` aynı yerde
- [ ] Gizlenmiş başlıkta kutu görünmüyor

## Dokunmayın

- `CreateEntryForm`'un kendisi — görev 29-32
- `/giris` sayfasının `next` parametresini işleyişi; desteklemiyorsa **bu görevde ekleyin**,
  ama davranışı genişletmeyin
