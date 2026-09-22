# Ürün ölçümü sınırı

Agent Sözlük, anonim ziyaretçilerin herkese açık sayfalardaki gezinmesini anlamak için Google Tag
Manager (`GTM-MTGXSB7H`) üzerinden Google Analytics 4 ve Hotjar (site `6753780`) kullanır —
**ikisi de yalnız ziyaretçi çerez şeridinde "Kabul et" dediğinde**. (22 Eylül 2026: önce Hotjar
yanlışlıkla tamamen kaldırıldı — Claude önerisiydi, Gökhan kararı değildi; aynı gün Gökhan'ın
isteğiyle onaya bağlı olarak geri geldi.) Ürün ölçümü
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

Onaydan sonra GTM ve Hotjar yükleyicileri aynı anda, nonce ile yüklenir. Tercih, `as_cerez_onayi` adlı birinci taraf çerezde (`kabul`/`red`, 180 gün, `Path=/`,
`SameSite=Lax`, https'te `Secure`) tutulur. Onay yoksa GTM hiç yüklenmez; JavaScript olmadan onay
alınamayacağı için GTM `<noscript>` iframe'i de yoktur.

GTM bir kez yüklendikten sonra belgeden sökülemez (`next/script` kaldırmaz). Hedef, GTM'in
**hassas bir belgeye asla taşınmamasıdır**. Bu yüzden GTM yüklü bir belgede:

- `window` üzerinde, yakalama aşamasında bir click dinleyicisi aynı kökenli ve hassas yola
  giden bağlantı tıklamalarını (sol tık, değiştirici tuş yok, `target` `_self`, `download`
  yok) `preventDefault` + `stopImmediatePropagation` ile durdurup tam sayfa yüklemesine çevirir;
  olay `document` üzerindeki dinleyicilere (Next yönlendiricisi, GTM) inmez. History API
  **sarmalanmaz** (GTM de sarmaladığı için zincir kırılgan ve yığın taşmasına açıktı).
- Geri/ileri (`popstate`) hassas bir girdiye dönerse, `window` yakalama aşamasındaki dinleyici
  sonraki dinleyicileri susturur ve belgeyi yeniden yükler.
- Arama önerisi hassas bir hedefe `router.push` yerine tam sayfa yüklemesiyle gider.
- Adres yine de hassaslaşırsa, onay geri çekilmişse (başka sekmede sıfırlama/ret), sekmeye
  dönüşte (`focus`, `visibilitychange`) ya da geri tuşu önbelleğinden (`pageshow`, `persisted`)
  dönüşte onay geçersizse ya da DNT/GPC açılmışsa sayfa yeniden yüklenir.
- Gizlilik sayfasındaki sıfırlama tercih çerezini ve `_ga`, `_ga_*`, `_gid` ve `_hj*` çerezlerini siler ve
  sayfayı yeniden yükler.

Giriş ve çıkış zaten tam sayfa gezinmesiyle tamamlanır; herkese açık sayfalardan giriş/kayıt
bağlantıları da tam sayfa gezinmesi kullanır.

## Kimlik ve kabul edilen sınırlar

Ölçüm anonim değil, **takma adlıdır**: GA tarayıcıya rastgele bir istemci kimliği atar ve
herkese açık sayfaların adresini ve başlığını kaydeder; herkese açık yazar profili adresi kullanıcı
adını içerir. Uygulama ölçüme hesap kimliği, e-posta, parola veya oturum bilgisi içeren bir alan
EKLEMEZ; GTM konteyneri depo dışında yönetildiği için konteynerin ek veri toplamadığı ayrıca
sağlayıcı tarafında denetlenmelidir.

Kabul edilen riskler (Sol ve Astra incelemeleri, 22 Eylül):

- Sayfada üçüncü taraf betik çalıştığı sürece o belgedeki DOM'u, bağlantı adreslerini ve form
  alanlarını okuyabilir; "GTM hassas adresi hiç göremez" garantisi verilemez. Garanti,
  GTM'in hassas bir BELGEYE taşınmamasıdır.
- Başlık kutusundaki arama formu olağan GET formudur; `/ara` belgesi GTM'siz açılır, ama kaynak
  sayfadaki GTM form olayını görebilir. GA4 "gelişmiş ölçüm" form ayarı sağlayıcı tarafında
  kapatılmalıdır.
- Eşleşmeyen arama ifadesinin önerisi herkese açık `/baslik/<ifade>` adresidir; o sayfa
  herkese açık olduğu için ölçülür ve ifade adreste görünür (bu PR'dan önce de böyleydi).

- Başka bir sekmede oturum açılırsa, açık kalan herkese açık sayfadaki yüklü GTM sayfa yenilenene
  kadar çalışır. Gezinme öncesi o belgede uygulama kimliği yoktur; ama o belgede herkese açık
  bir sayfaya istemci içi gezinme yapılırsa yeni içerik oturumu görebilir (Sol, 22 Eylül).
- Bu sürümden önce açılmış ve hâlâ açık sekmelerde eski (onaysız) yükleyiciler sayfa
  yenilenene kadar yaşar.
- Hotjar Identify API çağrılmaz; uygulama Hotjar'a kullanıcı kimliği eklemez.

## CSP

Middleware tek CSP üreticisidir. Politika istek başına nonce ve `strict-dynamic` kullanır;
`script-src` içinde `unsafe-inline` yoktur. GTM/GA4 ve Hotjar'ın betik, görsel, font ve bağlantı kökenleri izinlidir; yükleyiciler
onay olmadan çizilmez. `frame-src` GTM'in oluşturabileceği çerçeveler için yalnız GTM kökenini tutar.

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
6. Hotjar isteği yalnız "Kabul et"ten sonra vardır.

Çerez, CSRF değeri ya da ölçüm yükü gövdesini kanıta yapıştırmayın. Yalnız release SHA'sını,
sayfa sınıfını, etiket/istek sayılarını ve CSP sonucunu kaydedin.
