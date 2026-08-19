# 10 · Header'a giriş ve kayıt CTA'sı

**Plan kalemi:** P0-4 · **Boyut:** S · **Ön koşul:** görev 01+02 (buton tokenları), 08 (header iki satır)

## Bağlam

`/kayit` sayfası çalışıyor (HTTP 200 döndürdüğü canlıda doğrulandı) ama **sitedeki hiçbir link
oraya gitmiyor**. Tüm sayfadaki linkler tarandı, "Kayıt ol" hiçbirinde geçmiyor. Kayıt olmanın
tek yolu `/giris` sayfasına gidip oradaki linki bulmak.

Misafir header'ında yalnız düz metin bir "Giriş" linki var — ölçülen boyutu **31×20px**,
WCAG 2.2 SC 2.5.8'in (24×24) altında.

**Benchmark dayanağı:** Ekşi header'ında hem "giriş" hem "kayıt ol" var. Ayrıca ana sayfanın
**ana içerik alanında** misafire özel bir blok (`#login-signup`): _"…takip etmek, oylamak,
mesaj yazmak için giriş yapmalısın"_ + "kayıt ol" butonu + "hesabın var mı? giriş yap".

## Okunacak dosyalar

- `src/components/layout/site-shell.tsx:384-390` — misafir dalı
- `src/components/layout/account-menu.tsx` — oturum açmış kullanıcının karşılığı, boyutları eşleştirin
- `src/app/globals.css` — `.button-primary`, `.button-secondary`

## Yapılacak

Misafir dalını ikili CTA yapın:

```
Giriş  →  /giris    → .button-secondary görünümünde, min 44px yükseklik
Kayıt ol → /kayit   → .button-primary görünümünde, min 44px yükseklik
```

375px'te iki buton + logo + hamburger + tema satır 1'e sığmayabilir. Sığmıyorsa:
"Kayıt ol" birincil olarak kalsın, "Giriş" ikona veya daha kısa bir forma insin —
**"Kayıt ol"u gizlemeyin**, bu görevin tüm amacı o.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Elle, **çıkış yapmış** olarak: herhangi bir genel sayfada header'da "Kayıt ol" görünüyor mu,
tıklayınca `/kayit`'a gidiyor mu. 375px ve 1280px'te ayrı ayrı bakın.

## Bitti kriteri

- [ ] Herhangi bir genel sayfadan `/kayit`'a **tek tıkla** ulaşılıyor
- [ ] İki CTA da ≥44px yükseklikte
- [ ] 375px'te satır 1 taşmıyor, yatay kaydırma yok
- [ ] Oturum açmış kullanıcıda hiçbir şey değişmedi (`AccountMenu` aynı)

## Dokunmayın

- `AccountMenu` içeriği
- `/giris` ve `/kayit` sayfalarının kendisi
- Footer — görev 11'de
