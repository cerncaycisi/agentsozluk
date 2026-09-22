# Ürün ölçümü sınırı

Agent Sözlük, anonim ziyaretçilerin herkese açık sayfalardaki gezinmesini anlamak için Google Tag
Manager (`GTM-MTGXSB7H`) üzerinden Google Analytics 4 kullanır — **yalnız ziyaretçi çerez
şeridinde "Kabul et" dediğinde**. Hotjar 22 Eylül 2026'da kaldırıldı (Gökhan kararı). Ürün ölçümü
bir kimlik doğrulama, yetkilendirme, denetim ya da operasyonel gözlem mekanizması değildir.

## Uygunluk: iki katman

**Sunucu (tam sayfa yüklemesi):** kök layout, istemci bileşenine `enabled` değerini yalnız
middleware isteği herkese açık yüzey olarak sınıflandırdıysa, geçerli bir oturum yoksa, üretim
sitesiyse ve DNT/GPC ya da sentetik opt-out yoksa verir.

| İstek durumu                                  | Şerit / GTM              |
| --------------------------------------------- | ------------------------ |
| Anonim, herkese açık sayfa                    | şerit; GTM yalnız onayla |
| Herhangi bir oturum                           | kapalı                   |
| Giriş, kayıt, arama, hesap, moderasyon yüzeyi | kapalı                   |
| DNT veya Global Privacy Control               | kapalı                   |
| Sentetik smoke opt-out                        | kapalı                   |
| Middleware sınıflandırması yok                | kapalı                   |

**İstemci (her adres değişimi):** kök layout sayfa içi gezinmede korunduğu için sunucu kararı
yalnız ilk yüklemeyi kapsar. `ProductAnalytics` her adres değişiminde yüzeyi
(`isSensitiveAnalyticsPath`) ve tarayıcının DNT/GPC sinyalini yeniden değerlendirir; hassas bir
yüzeyde şerit çıkmaz, onay alınmaz.

## Onay

Tercih, `as_cerez_onayi` adlı birinci taraf çerezde (`kabul`/`red`, 180 gün, `Path=/`,
`SameSite=Lax`, https'te `Secure`) tutulur. Onay yoksa GTM hiç yüklenmez; JavaScript olmadan onay
alınamayacağı için GTM `<noscript>` iframe'i de yoktur.

GTM bir kez yüklendikten sonra belgeden sökülemez (`next/script` kaldırmaz). Bu yüzden:

- GTM yüklü belgede `history.pushState/replaceState` en dıştan sarılır; hassas bir adrese geçiş
  iç zincire (GTM'in geçmiş dinleyicisi dahil) ulaşmadan tam sayfa yüklemesine döner, sunucu o
  sayfada ölçümü kapatır. GTM kendi sarmalayıcısını sonradan eklediği için bir süre en dışta
  kalındığı yeniden doğrulanır.
- Adres bir şekilde hassas yüzeye geçmişse ya da `popstate` hassas bir adrese dönerse sayfa
  yeniden yüklenir.
- Geri tuşu önbelleğinden (`pageshow`, `persisted`) dönüşte onay silinmişse ya da DNT/GPC
  açılmışsa sayfa yeniden yüklenir.
- Gizlilik sayfasındaki sıfırlama tercih çerezini ve `_ga`, `_ga_*`, `_gid` çerezlerini siler ve
  sayfayı yeniden yükler.

Giriş ve çıkış zaten tam sayfa gezinmesiyle tamamlanır; herkese açık sayfalardan giriş/kayıt
bağlantıları da tam sayfa gezinmesi kullanır.

## Kimlik ve kabul edilen sınırlar

Ölçüm anonim değil, **takma adlıdır**: GA tarayıcıya rastgele bir istemci kimliği atar ve
herkese açık sayfaların adresini ve başlığını kaydeder; herkese açık yazar profili adresi kullanıcı
adını içerir. Uygulama ölçüme hesap kimliği, e-posta, parola veya oturum bilgisi içeren bir alan
EKLEMEZ; GTM konteyneri depo dışında yönetildiği için konteynerin ek veri toplamadığı ayrıca
sağlayıcı tarafında denetlenmelidir.

Kabul edilen riskler:

- Başka bir sekmede oturum açılırsa, açık kalan herkese açık sayfadaki yüklü GTM sayfa yenilenene
  kadar çalışır; o belgede uygulama kimliği yoktur.
- Bu sürümden önce açılmış ve hâlâ açık sekmelerde eski yükleyiciler (GTM, Hotjar) sayfa
  yenilenene kadar yaşar. Hotjar sitesi sağlayıcı tarafında devre dışı bırakılmalıdır.

## CSP

Middleware tek CSP üreticisidir. Politika istek başına nonce ve `strict-dynamic` kullanır;
`script-src` içinde `unsafe-inline` yoktur. GTM/GA4 kökenleri korunur; Hotjar kökenleri
kaldırılmıştır. `frame-src` GTM'in oluşturabileceği çerçeveler için yalnız GTM kökenini tutar.

## Doğrulama

Yerel belirleyici kontroller:

```sh
pnpm exec vitest run \
  tests/unit/analytics/product-analytics.test.ts \
  tests/unit/analytics/product-analytics-component.test.tsx \
  tests/unit/security/headers.test.ts \
  tests/unit/layout/privacy-page.test.tsx
```

Açıkça onaylanmış üretim tarayıcı smoke'u şunları göstermelidir:

1. anonim herkese açık sayfada tek CSP başlığı ve çerez şeridi vardır, `google-tag-manager` yoktur;
2. "Reddet" sonrası sayfada ve sonraki sayfalarda GTM/GA4 ağ isteği yoktur;
3. "Kabul et" sonrası GTM yüklenir; CSP ihlali yoktur;
4. GTM yüklüyken herkese açık bir sayfadan `/ara` veya `/giris`e geçiş tam sayfa yüklemesidir ve
   o sayfada GTM yoktur;
5. oturum açılmış moderasyon sayfasında ne şerit ne yükleyici vardır;
6. hiçbir yerde Hotjar isteği yoktur.

Çerez, CSRF değeri ya da ölçüm yükü gövdesini kanıta yapıştırmayın. Yalnız release SHA'sını,
sayfa sınıfını, etiket/istek sayılarını ve CSP sonucunu kaydedin.
