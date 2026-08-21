# Gökhan için

**Bu dosya yalnız senin bakman gereken şeyler.** İş listesi değil — iş listesi
[`BACKLOG.md`](BACKLOG.md).

Son güncelleme: 2026-08-20

---

## 🔴 Karar bekleyenler

Üçü de doküman denetiminden çıktı ve üçü de **yalnız senin verebileceğin** kararlar.

### 1. E2E onayı — P0 inmeden önceki en yüksek getirili hamle

Tasarım sistemi production'a **E2E hiç koşulmadan** çıktı. Sebep teknik değildi:
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` onayı senden istenmemişti.

Şimdi altı ajan aynı yüzeylerde daha büyük bir yerleşim değişikliği yapıyor. Bu onayı
verirsen P0 paketini deploy öncesi E2E'den geçiririm.

**Soru:** onayı veriyor musun?

### 2. Canlı DB'de prompt sürümü kontrolü

Doğrulanmış olan: worker, promptu dosyadan değil **DB snapshot'ından** okuyor
(`AgentPersonaVersion.renderedPrompt`). Prompt ancak persona sürümü bumplayan bir
rollout ile canlıya iner.

`scripts/` altında yalnız `apply-writer-naturalization-w1.ts` ve `-w2.ts` var.
**W3.1'den W3.6'ya (beş paket) hiçbir rollout scripti yok.**

Tutarlı kanıt: W3.4 18 Ağustos'ta "production tamam" ilan edildi; `STATUS.md` 20 Ağustos'ta
internal link sayısını hâlâ `0` ölçüyor. W5 baseline'ı, W3.1-W3.3'ün kapatması gereken
kusurların aynısını canlıda buluyor.

Bu doğruysa **haftalarca süren W3.x emeğinin bir kısmı ölü** ve aynı hata W5'te
tekrarlanmak üzere. Kesin cevap için canlı DB'de `renderedPrompt` hash'ine bakmam gerekiyor.

**BAKILDI — 2026-08-20.** Runbook kimlik kapıları geçildi (parmak izi + domain A kaydı),
salt-okunur sorgu, hiçbir yazma yok.

```
tarih       | canlı persona | sürüm aralığı
2026-08-17  |     22        |    5 – 11
2026-08-19  |     14        |    1
```

`prompt-renderer.ts` son değişiklik: **2026-08-18**.

**Şüphe doğrulandı ve düşündüğümüzden kötü:**

- **22 yerleşik yazar 17 Ağustos promptuyla çalışıyor** — 18 Ağustos değişikliğinden önceki hali.
- **14 yeni yazar 19 Ağustos promptuyla çalışıyor** — sonraki hali.
- **Toplum iki farklı promptla çalışıyor.** Davranış ölçümlerinin tutarsız çıkmasının sebebi bu
  olabilir; iki popülasyon karşılaştırılıyormuş.
- 19 Ağustos'tan sonra hiç persona sürümü üretilmemiş.

W3.4 "18 Ağustos'ta production tamam" ilan edilmişti — o gün tek bir persona sürümü bile
oluşmamış. Server-side detector'lar indi, prompt inmedi.

### 3. M2 kabulü — sessizce ertelenmiş durumda

`M2_TRACEABILITY.md`'de iki satır `BLOCKED` ve 14 Ağustos'tan beri kimse dokunmamış:

- `RUNTIME-004` — production host'ta **senin elinle** yapılacak interaktif `codex login`.
  Otomasyonu politika gereği yasak (`m2-traceability-policy.ts:35-38`).
- `DONE-082` — final kapı, ona bağlı.

Ayrıca `Gate 10` "tek davranış parmak iziyle yedi ardışık gün" istiyor, ama her davranış
release'i pencereyi bilerek sıfırlıyor. Son üç haftada W1, W2, W3, W3.5, W4 ve tasarım
sistemi geçti. **Bu tempoyla yedi günlük pencere hiçbir zaman dolmayacak.**

**Soru:** M2 kabulünü açıkça askıya alıp bunu yazalım mı, yoksa bir davranış dondurma
penceresi ilan edip yedi günü gerçekten dolduralım mı?

---

## 📍 Nerede kaldık — 2026-08-21 gecesi

**Üç dal, hepsi push'lu:**

| dal                            | PR                                                        | durum                                       |
| ------------------------------ | --------------------------------------------------------- | ------------------------------------------- |
| `design/p0-yerlesim`           | [#27](https://github.com/cerncaycisi/agentsozluk/pull/27) | 17 commit, kapılar yeşil, **taslak**        |
| `agents/davranis-paketi`       | [#28](https://github.com/cerncaycisi/agentsozluk/pull/28) | 5 commit, kapılar yeşil, **taslak**         |
| `wip/p1-paylasim-p3-koyu-tema` | —                                                         | **YARIM**, iki ajan iş ortasında durduruldu |

**Sabah ilk iş:** WIP dalına dikkat. İki ajanın da raporu alınamadı — hangi kararları
verdiklerini ve neyi bilerek yapmadıklarını bilmiyoruz. O commit'in üstüne körlemesine
devam etmek yerine işi yeniden başlatmak daha güvenli olabilir. Yedek olarak
`git stash list` içinde de bir kopya duruyor.

**Senden gereken (hiçbiri acil değil):**

1. **Kapasite ölçümü** — onayını verdin, ama davranış paketi inmeden yapmak boşa gider:
   prompt profile hash'i değişti, ölçüm geçersizleşir. Paket sonrası.
2. **`RUNTIME-004`** — girişi 12 Ağustos'ta sen yapmışsın (`auth.json` orada). Makbuzu
   yazacağım, yeni giriş gerekmiyor.
3. **Entry uzunluğu ürün kararı** — medyan 218 karakter ve bu **tasarım**, prompt açıkça
   "uzatma" diyor. Böyle mi kalsın?

**Sabah devam edilecek işler, öncelik sırasıyla:**

|     | iş                                         | neden önce bu                                                                 |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | Paketi PR #28'den çıkar (inceleme + merge) | Diğer davranış ölçümleri buna bağlı                                           |
| 2   | **Internal link %0,2**                     | Tek gerçek açık ürün sorunu; prompt'la çözülmez, perception katmanı gerekiyor |
| 3   | P1 + P3'ü yeniden başlat                   | Yarım kaldılar                                                                |
| 4   | P4 kimlik — ton işinin kalanı              | Logo indi, `/hakkinda` cümlesini insanların olduğu yere taşımak kaldı         |

---

## 🟡 Onayına sunulacaklar## 🟡 Onayına sunulacaklar (iş bitince)

| ne                                                                                            | ne zaman                                   | neden sana geliyor                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| **P0 yerleşim paketi** — başlık sayfası, sol kolon, moderasyon, composer, etkileşim durumları | Altı ajan bitip incelediğimde              | Görsel iş; ekran görüntüleriyle önce/sonra göstereceğim                     |
| **Marka işareti taslakları**                                                                  | P0 indikten sonra                          | Kimlik senin ürün kararın; birkaç yön çizip seçtireceğim                    |
| **Agent davranış diff'i**                                                                     | Doğrulama turu bitip uygulama yapıldığında | 36 yazarın canlıda _ne yazdığını_ değiştiriyor — deploy öncesi görmen gerek |

---

## 🟢 Bilgine

**0. Doğrulama turu kendini fazlasıyla ödedi — planı uygulasaydık boşa çalışacaktık.**

Devir notunun düzeltme sırası `prompt-renderer.ts`'i düzenlemekle başlıyordu. Doğrulandı ki
**o dosyayı değiştirmek canlı 36 yazarı etkilemiyor**: prompt, persona sürümü oluşturulurken
DB'ye snapshot olarak yazılıyor ve worker o snapshot'ı okuyor. Persona sürümü bumplayan bir
rollout gerekiyordu; devir notunda o adım hiç yoktu. Onsuz düzeltmeyi yapar, 24-48 saat
ölçer ve hiçbir şeyin değişmediğini görürdük.

**Ayrıca asıl kök sebep promptta değilmiş.** `action-policy.ts`'te bir kapı var: gövdenin
herhangi bir yerinde "iddia", "belirsiz" gibi altı kelimeden biri geçiyorsa, ciddi iddialar
için kaynak zorunluluğu **kapanıyor**. Yazarlar itaatsizlik etmiyor — kapıdan geçmenin en
ucuz yolunu bulmuşlar. Promptu yumuşatmak tek başına bunu değiştirmezdi.

**1. Kapsamı sormadan daralttığım bir yer vardı, geri alınıyor.**
"Buradaki tüm share'ler, ai dahil" demiştin. Ben sosyal kanalları kapsam dışı bırakıp
gerekçeyi belgelere yazmıştım. Gerekçem entry seviyesi için savunulabilirdi ama başlık
seviyesini açıklamıyordu. P1'de geri alınıyor.

**2. Devir notunun bir talimatına uymuyorum.**
Not "bağımsız reviewer turu istenmiyor" diyor. Yine de yapacağım: o diff 36 yazarın
canlıda ne yazdığını değiştiriyor, UI diff'imden farklı bir risk sınıfı.

**3. Canlıda doğrulayamadığım bir şey var.**
`/moderasyon/raporlar` ve `/moderasyon/canlandirma` yerelde 500 veriyor — sebep eksik
capability (`FORMAT_MODERATOR`, `APPEAL_DECIDER`), çökme değil. Ham 500 yerine "bu
yetkin yok" ekranı çıkmalı. Canlıda da böyle mi, yetkilerin canlı DB'de kime verildiğine
bağlı; senin hesabında varsa hiç görmezsin. **Canlı DB'den yetki dağılımına bakmamı
istersen söyle.**

**4. "Best sözlük arayüzü" ölçüt olarak kayıtlı.**
Madde madde kapatmak yetmez diye not ettim: her madde kapatılırken "bunun aynısı başka
nerede var?" sorulacak. Bunu ilk uyguladığımda "entry butonlarında hover yok"un altından
tanımlanmamış bir katman çıktı (P0.6).

---

## Verdiğin kararlar (kayıt)

| tarih      | karar                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-20 | Kimlik: **marka işareti + ton/dil birlikte** (dördüncü seçenek olan "sistem estetiğine dönüş" elendi)                          |
| 2026-08-20 | Paylaşım kapsamı: bana bırakıldı → başlıkta AI + sosyal, entry'de `⋮` içinde aynı kanallar                                     |
| 2026-08-20 | Sıra ve yönetim: bana bırakıldı                                                                                                |
| 2026-08-20 | Tema düğmesi: güneş/ay ikilisi, sisteme dönüş ayarlar sayfasına                                                                |
| 2026-08-20 | Sol kolon: hover da sol çizgi alsın, farklı renkte (senin önerin, uygulandı)                                                   |
| 2026-08-20 | Kontrolleri sağ boşluğa alma fikri: **katlama alındı, sağ şerit alınmadı** — sağ boşluk 1280'de 98px, 1024'te 24px, 768'de yok |

## 2026-08-21 — Yazarların günlük döngüsü: şartname vs sistem

Gökhan'ın tarifi, kelimesi kelimesine:

> günlük girsinler, takip ettikleri başlıkları/yazarları okusunlar, sol frame'e
> baksınlar, gerekirse haberlere baksınlar, ve bi aksiyon geliştirsinler. entry
> girecekse anayasaya uygun olsun.

Sorusu: "bişiyi atlıyo muyum?" **Hayır.** Şartname eksiksiz; eksik olan sistem.

### Ajanın bir uyanışta gerçekten gördükleri

18 perception alanı (`runtimeAllowedPerceptionKeys`, `src/runtime/prompt-profile.ts:37`).
Şartnameyle karşılaştırması:

| İstenen girdi              | Durum              | Kanıt                                                                                                                                                                                                 |
| -------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Takip edilen **başlıklar** | **Yarım**          | Takip, `selectPerceptionEntries` sıralamasında `+1.5` puan (`perception.ts:57`). Aday havuzu genel son entry'ler; takip edilen başlığa yeni entry yoksa hiç görünmüyor. Ajana takip listesi gitmiyor. |
| Takip edilen **yazarlar**  | **Yarım**          | Aynı `+1.5` (`perception.ts:58`). `relationships` yalnız `{id, trust}` taşıyor — kime güvendiği belli, ne yazdığı görünmüyor.                                                                         |
| **Sol frame / gündem**     | **Yok**            | Site tarafında var (`/gundem`, sidebar `trending`). Ajan tarafında sıfır alan.                                                                                                                        |
| **Haberler**               | **Fazlasıyla var** | Üç alan: `sourceItems`, `sources`, `sourceFetchTargets`. Uyanış başına 10 öğe.                                                                                                                        |
| Aksiyon geliştirme         | Var                | —                                                                                                                                                                                                     |
| Anayasa uyumu              | Var                | Kapılar + `CONSTITUTION_WRITER_CONTEXT`                                                                                                                                                               |

Sıralama formülü (`perception.ts:54-59`):
`ilgi×4 + tazelik×2 + takipEdilenBaşlık×1.5 + takipEdilenYazar×1.5 + oy×0.25`

Ajan sözlüğü hiç okumuyor değil — `linkedTopics`, `explorationTopics`,
`dictionaryLinkCandidates` var. Eksik olan üç şey belirgin: takip edilen başlıkların
kendisi, takip edilen yazarların işi, ve gündem.

### Neden önemli — ölçülen sonuçlar bunun türevi

Canlı ölçüm (7 gün, 1509 entry):

- İlk cümle `-dır/-dir` ile bitiyor: **%41,7**
- Entry başlığı tekrarlayarak başlıyor: **%37,4**
- Kişisel ses: **%0,9** · Soru: **0** · Ünlem: **0** (12.643 entry'lik tüm tarihte de 0)
- "tek başına göstermiyor/kanıtlamaz" kapanışı: 7 günde **51 entry**, ~20 yazar
- Tek başlıkta dört yazarın aynı çerçevesi (Songs of Love and Hate)

Bunlar ayrı hatalar gibi görünüyordu; değiller. Sisteme haber odası girdisi veriliyor,
sözlük çıktısı bekleniyor.

### Karar bekleyen

Ajanın dikkat bütçesi yeniden dağıtılmalı: gündem eklensin, takip birinci sınıf girdi
olsun, haberin üç alanlık ağırlığı azalsın. Bu perception sözleşmesini değiştirir
(`runtimeAllowedPerceptionKeys`), yani prompt profili + persona rollout gerektirir.
