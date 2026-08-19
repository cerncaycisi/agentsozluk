# 33 · Temada "Sistem" seçeneği

**Plan kalemi:** P2-20 · **Boyut:** S · **Ön koşul:** yok

## Bağlam

`src/components/ui/theme-toggle.tsx` yalnız açık↔koyu ikili geçiş yapıyor.
Kullanıcı bir kez tıkladığında:

```js
document.cookie = `ajan_theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax`;
```

**1 yıllık** bir cookie yazılıyor ve sistem tercihi kalıcı olarak eziliyor. Geri dönüş yolu yok.

`globals.css` `prefers-color-scheme`'i **zaten destekliyor**
(`:root:not([data-theme="light"])` bloğu) — altyapı hazır, UI'dan oraya dönüş yok.

## Okunacak dosyalar

- `src/components/ui/theme-toggle.tsx` — tamamı (46 satır)
- `src/app/layout.tsx:44-46` — sunucuda cookie okuma ve `data-theme` özniteliği
- `src/app/globals.css` — üç tema bloğu

## Yapılacak

1. Üç durumlu hale getirin: **Sistem → Açık → Koyu → Sistem**.
   Basit bir döngü butonu yeterli; dropdown da kabul edilir ama üç durumu da açıkça göstermeli.
2. "Sistem" seçildiğinde:
   - `document.documentElement.removeAttribute('data-theme')`
   - `localStorage.removeItem('ajan_theme')`
   - Cookie'yi **silin**: `ajan_theme=; Path=/; Max-Age=0`
   Böylece `layout.tsx` sunucuda `themeAttribute`'u `undefined` bırakır ve CSS
   `prefers-color-scheme`'e düşer.
3. `aria-label` üç duruma göre değişsin ve **bir sonraki** durumu söylesin
   (örn. sistemdeyken "Açık temaya geç").
4. İkon üç durumu ayırt etsin — `lucide-react`'te `Sun`, `Moon` zaten kullanılıyor;
   sistem için `MonitorSmartphone` veya `SunMoon` uygun.
5. `ready` bayrağı deseni korunsun — hidrasyon uyuşmazlığını o önlüyor.
6. Sunucu tarafında değişiklik gerekmiyor: `layout.tsx` zaten cookie yoksa
   `themeAttribute`'u `undefined` bırakıyor. **Teyit edin.**

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Elle:
- Koyudan sisteme dönün → işletim sistemi temasını takip ediyor mu
- İşletim sistemi temasını değiştirin (macOS: Sistem Ayarları → Görünüm) →
  sayfa yenilemeden takip ediyor mu
- Cookie'nin gerçekten silindiğini DevTools → Application → Cookies'te doğrulayın
- Sayfayı yenileyin → sistem seçimi korunuyor mu, flaş (FOUC) var mı

## Bitti kriteri

- [ ] Üç durum da çalışıyor
- [ ] "Sistem"de cookie ve localStorage temizleniyor
- [ ] İşletim sistemi teması değişince sayfa yenilemeden takip ediyor
- [ ] Sayfa yüklenirken tema flaşı yok
- [ ] `aria-label` bir sonraki durumu doğru söylüyor

## Dokunmayın

- `globals.css`'teki tema blokları — zaten doğru
- Cookie adı (`ajan_theme`) — sunucu tarafı ona bakıyor
