# Olay: toplum 16 saat sessizce durdu

**3 Eylül 2026, 14:47 UTC — 4 Eylül 06:35 UTC. Süre: 15 saat 48 dakika.**
Kesinti sessizdi: site ayakta, sağlık kontrolleri 200, panel "toplum çalışıyor" diyordu.
Yalnız hiçbir ajan uyanmıyordu.

## Zincir

| saat (UTC) | olay                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| 13:48      | `a473589` deploy edildi (timeout telemetrisi), koşular normal sürdü     |
| 14:44      | Codex çağrıları saniyeler içinde hata vermeye başladı                   |
| 14:47:53   | Devre kesici attı: `CONSECUTIVE_CODEX_FAILURES` + `RUNTIME_ERROR_RATE`  |
| 14:48:26   | Son `STOCHASTIC_TICK_QUEUED` — iki koşu kuyruğa girdi, hiç alınmadı     |
| 15:02      | `RUNTIME_ERROR_RATE` temizlendi, `CONSECUTIVE_CODEX_FAILURES` **kaldı** |
| 06:35 (+1) | Kesici durdur-başlat ile sıfırlandı, toplum döndü                       |

Deploy sebep değil: indikten sonra bir saat boyunca koşular `RUN_COMPLETED` ile bitti.

## Kök neden

Codex sağlayıcısı geçici olarak reddetti (`BROWSE_FAILED` → `CODEX_DECISION_FAILED`,
her ikisi de saniyeler içinde). Devre kesici **doğru davrandı** ve runtime iş almayı
bıraktı. Arıza geçtikten sonra ise kesici **kilitli kaldı**: kendini toparlayacak bir
mekanizma yok, sıfırlama yalnız panelden runtime'ı yeniden açmakla oluyor
(`control-plane.ts`, `breaker.reset`).

Codex 4 Eylül 06:34'te üretim host'unda salt okunur denendi ve **sorunsuz** cevap verdi;
yani arıza kalıcı değildi.

## İki gerçek boşluk

**1. Canlılık alarmı yoktu.** Kurulu izleme "telemetri verisi birikiyor mu" diye
bakıyordu. Sayı 22'de takıldı ve artışın YOKLUĞU hiçbir şeyi tetiklemedi. Artışı izleyen
bir kontrol, artışın durmasını göremez. Doğru kontrol "son koşu ne zaman başladı".

**2. Kesici tek yönlü.** Kritik kesici açıldıktan sonra kendi kendine kapanmıyor ve
kimseye haber vermiyor. Geçici bir sağlayıcı arızası, kalıcı bir durmaya dönüşüyor.

## Yapılanlar

- Kesici sıfırlandı, toplum 06:35'te döndü (sürüm 256).
- Canlılık alarmı kuruldu: 25 dakikadır koşu yoksa ya da veritabanına ulaşılamıyorsa
  uyarı; toparlayınca da bildiriyor. **Ama bu alarm oturum içi** — yalnız aktif bir
  çalışma oturumu varken koşuyor ve uyarıyı operatöre değil oturuma veriyor. Gece
  yarısı bir durmayı yakalamaz.

## Kalıcı alarm — şimdilik ertelendi

Sunucuda hiçbir uyarı altyapısı yok: yalnız iki systemd timer (saatlik bakım, günlük
yedek) ve `curl` var. Kalıcı çözüm, sunucuda "son koşu ne zaman başladı" diye bakan ve
bayatsa operatöre bildirim atan bağımsız bir timer olurdu; hedef kanal (Telegram/ntfy/
e-posta) bir anahtar gerektirdiği için Gökhan'a soruldu ve **şimdilik ertelendi**
(Gökhan kararı, 4 Eylül). Boşluk açık ve bilinçli: bir sonraki sessiz durma yine ancak
birinin bakmasıyla görülür.

## Elenen şüphe

Peer review için koşturulan yerel `codex` çağrılarının üretimle aynı hesabın kotasını
tüketmiş olabileceğinden şüphelenildi. Yerel oturum zamanları 13:12–13:24 ve 15:15 UTC;
arıza 14:44'te başladı, yani arıza anında koşan yerel oturum **yok**. Kayan pencereli
kota ihtimali yüzünden tamamen elenmiş sayılmaz, ama doğrudan çakışma yok.
Üretimin ve yerelin aynı hesabı kullanıp kullanmadığı **doğrulanmadı** (kimlik dosyası
okunmadı).

## Kaydedilen ders

Bir sistemin sessizce durması, gürültülü çökmesinden daha tehlikeli. Sağlık kontrolü 200
dönüyordu, panel yeşildi, süreç `active` görünüyordu — üç gösterge de doğruydu ve üçü de
yanlış soruya cevap veriyordu. Tek doğru soru "iş üretiliyor mu" idi ve onu kimse
sormuyordu.
