# 19 · Dokunma hedeflerini 24px'in üstüne çıkar

**Plan kalemi:** P2-15 · **Boyut:** S · **Ön koşul:** yok (ama görev 11 footer'ı zaten düzeltiyorsa çakışmayın)

## Bağlam

375px'te canlı ölçümde WCAG 2.2 SC 2.5.8 (Target Size Minimum, 24×24 CSS px) ihlalleri:

| Öğe | Ölçülen |
|---|---|
| Header "Giriş" linki | 31×20 |
| Entry tarih linki | 115×17 |
| Entry yazar linki | 128×17 |
| Tüm footer linkleri | h=20 |

Ayrıca 44×44'ün altında ama 24'ü geçen (uyarı, ihlal değil): hamburger 40×40, tema 40×40.

## Okunacak dosyalar

- `src/components/entries/entry-preview.tsx:66-89` — footer'daki tarih ve yazar linkleri
  (görev 17 bu bölgeyi yeniden düzenlediyse yeni hâline bakın)
- `src/components/layout/site-shell.tsx:442-463` — footer nav (görev 11 bunu düzelttiyse atlayın)
- `src/components/layout/site-shell.tsx:387` — "Giriş" (görev 10 bunu düzelttiyse atlayın)

## Yapılacak

1. Entry footer'ındaki tarih ve yazar linklerine `inline-flex min-h-6 items-center` ekleyin.
2. Görev 10 ve 11 çalışmadıysa header "Giriş" ve footer linklerini de düzeltin;
   çalıştıysa yalnız doğrulayın.
3. Hamburger ve tema butonlarını `size-10` (40px) → `size-11` (44px) yapın.
   Bu bir ihlal değil ama mobilde belirgin bir iyileşme; header yüksekliği bütçesini
   (görev 08: ≤110px) aşmadığını doğrulayın.
4. Bitişik küçük hedefler arasında en az 8px boşluk bırakın.

## Doğrulama

375px'te, birkaç farklı sayfada (başlık, gündem, profil, arama):

```js
[...document.querySelectorAll('a,button,input,select,textarea,[role=button]')]
  .filter(el => { const r = el.getBoundingClientRect();
                  return r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24); })
  .map(el => ({ t: (el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,30),
                w: Math.round(el.getBoundingClientRect().width),
                h: Math.round(el.getBoundingClientRect().height) }))
// boş dizi dönmeli
```

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Bitti kriteri

- [ ] Yukarıdaki kontrol dört sayfada da boş dizi dönüyor
- [ ] Header yüksekliği hâlâ ≤110px (375px'te)
- [ ] Görsel olarak satır aralıkları bozulmadı

## Dokunmayın

- İkonların kendi boyutları (`size={17}` vb.) — büyüyen tıklanabilir alan, ikon değil
