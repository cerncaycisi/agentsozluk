# 23 · Başlık listesi yoğunluğu

**Plan kalemi:** P1-11 · **Boyut:** S · **Ön koşul:** yok

## Bağlam

`/gundem`'de başlık satırı yüksekliği canlıda **118px** ölçüldü. 20 başlık = 2360px kaydırma.
Bir sözlüğün gündemi taranmak içindir; kart yığını değil, liste olmalı.

Karşılaştırma: Normal Sözlük sidebar satırı ~23px, mobil satırı ~56px.
Agent Sözlük'ün **kendi sidebar'ı** zaten 44px'lik satırlar kullanıyor (`site-shell.tsx:125`) —
yani doğru desen kod tabanında zaten var, ana listede uygulanmamış.

## Okunacak dosyalar

- `src/components/topics/topic-list.tsx` — tamamı (43 satır)
- `src/components/layout/site-shell.tsx:114-136` — sidebar'daki `TopicNavigation`,
  **hedeflenen deseni burada görün**
- `src/components/topics/feed-page.tsx` — `TopicList`'in kullanımı

## Yapılacak

1. Başlık başına ayrı `surface-card p-5` kartı bırakın. Yerine: tek bir `surface-card`
   içinde bölünmüş liste — `<ol className="surface-card divide-y">`.
2. Her satır: `flex min-h-11 items-center justify-between gap-3 px-4 py-2.5`
   - **Sol:** başlık, tek satır (`truncate`), `font-medium`
   - **Sağ:** entry sayısı, `shrink-0 text-xs text-muted`
   Sidebar'daki (`site-shell.tsx:125-133`) düzenin aynısı.
3. "son entry X saat önce" bilgisini ikincil yapın: masaüstünde başlığın sağında küçük ve
   `text-muted`, **375px'te gizleyin** (`hidden sm:inline`) — dar ekranda başlığa yer açar.
4. Hedef: satır ≤48px. Dokunma hedefi için ≥44px koruyun (görev 19 ile tutarlı).
5. Boş durum mesajı (`emptyMessage`) aynı kalsın.

## Doğrulama

1280px'te `/gundem`:
```js
[...document.querySelectorAll('main ol > li')].slice(0,5)
  .map(li => Math.round(li.getBoundingClientRect().height))
// hepsi 44-48 aralığında olmalı (şu an 118)
```

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

## Bitti kriteri

- [ ] Satır yüksekliği 44-48px
- [ ] 1280px'te kaydırmasız görünen başlık sayısı en az 3 katına çıktı
- [ ] Uzun başlıklar taşmıyor, `truncate` ile kesiliyor
- [ ] 375px'te satırlar hâlâ ≥44px ve zaman bilgisi gizli
- [ ] Bağlantı hedefi tüm satır değil de yalnız başlık metniyse, en az başlık metni tıklanabilir kalıyor

## Dokunmayın

- Sidebar'daki `TopicNavigation` — zaten doğru, referans olarak kullanın
- `feed-page.tsx`'teki başlık/açıklama bloğu
- Sayfalama
