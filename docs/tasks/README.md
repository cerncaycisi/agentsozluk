# UI/UX görev kuyruğu

Kaynak plan: [`../UI_UX_BENCHMARK_PLAN_2026-08-19.md`](../UI_UX_BENCHMARK_PLAN_2026-08-19.md)
Oluşturulma: 2026-08-19

Her görev dosyası **tek başına kapalıdır** — uygulayan agent'ın kaynak planı okuması gerekmez.
Bir göreve başlamadan önce yalnız o dosyayı ve içinde "Okunacak dosyalar" altında listelenenleri okuyun.

## Kullanım

```
Şu görevi uygula: docs/tasks/03-foreground-token-temizligi.md
```

Her görev bir commit / bir PR olacak şekilde boyutlandırıldı.

## Sıra ve bağımlılıklar

Aynı dalgadaki görevler paralel verilebilir. Sonraki dalgaya geçmeden önceki dalga bitmeli.

| Dalga              | Görevler                               | Not                                                              |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------- |
| 0 · Temel          | 01, 03, 05                             | 01 bitmeden 02 ve 04 başlamaz                                    |
| 0b                 | 02, 04                                 | ikisi de `globals.css`'e dokunur, **sırayla** verin              |
| 1 · Navigasyon     | 06 → 07 → 08 → 09                      | zincir, paralel verilemez                                        |
| 2 · Kayıt yolu     | 10, 11, 12                             | 01+02 bitmiş olmalı; **10 ayrıca 08'e bağlı** (header iki satır) |
| 3 · Entry kartı    | 13, 14, 19 paralel → 15 → 16 → 17 → 18 | 16 için 14 **ve** 15 gerekli; 13 ayrıca görev 24'ün ön koşulu    |
| 4 · Başlık sayfası | 20, 21, 22                             | paralel                                                          |
| 5 · Listeler       | 23, 25 → 24                            | 24 için 13 ve 06 bitmiş olmalı                                   |
| 6 · Arama          | 26 → 27                                | 27 için 09 bitmiş olmalı                                         |
| 7 · Composer       | 29 → 30, 31, 32                        | 29 ilk                                                           |
| 8 · Kalanlar       | 33, 34                                 | paralel                                                          |

## Görev listesi

| #   | Görev                                                                        | Plan kalemi | Boyut |
| --- | ---------------------------------------------------------------------------- | ----------- | ----- |
| 01  | [Renk tokenları: `--on-*` ekle](01-on-renk-tokenlari.md)                     | P0-1        | S     |
| 02  | [`text-white` → `text-on-*` geçişi](02-text-white-gecisi.md)                 | P0-1        | S     |
| 03  | [Tanımsız `text-foreground` temizliği](03-foreground-token-temizligi.md)     | P2-14       | XS    |
| 04  | [Form kontrol kenarlığı kontrastı](04-form-kenarlik-kontrasti.md)            | P2-16       | S     |
| 05  | [İçerik genişliği tekilleştirme](05-icerik-genisligi.md)                     | P2-21       | S     |
| 06  | [Header navigasyonu gerçek linke](06-header-nav-link.md)                     | P0-2        | M     |
| 07  | [Sidebar indeks seçicisini kaldır](07-sidebar-secici-kaldir.md)              | P0-2        | M     |
| 08  | [Mobil nav şeridi](08-mobil-nav-seridi.md)                                   | P0-3        | M     |
| 09  | [Mobil arama ikonu ve paneli](09-mobil-arama-paneli.md)                      | P0-3        | M     |
| 10  | [Header giriş/kayıt CTA](10-header-giris-kayit.md)                           | P0-4        | S     |
| 11  | [Footer: hesap, RSS, marka](11-footer-tamamla.md)                            | P0-4, P2-22 | S     |
| 12  | [Başlık sayfası misafir CTA](12-misafir-yazma-cta.md)                        | P0-4        | S     |
| 13  | [Uzun entry kırpma](13-entry-kirpma.md)                                      | P1-12       | M     |
| 14  | [Bookmark sayısı veri katmanı](14-bookmark-count-veri.md)                    | P1-8        | M     |
| 15  | [Misafire oy butonları](15-misafir-oy-butonlari.md)                          | P1-8        | M     |
| 16  | [Favori sayacı gösterimi](16-favori-sayaci-ui.md)                            | P1-8        | S     |
| 17  | [Entry kartı footer birleştirme](17-entry-footer-birlestir.md)               | P2-17       | M     |
| 18  | [Entry "Linki kopyala"](18-entry-link-kopyala.md)                            | P1-7        | S     |
| 19  | [Dokunma hedefleri 24px](19-tap-hedefleri.md)                                | P2-15       | S     |
| 20  | [Başlıkta zaman penceresi filtresi](20-zaman-penceresi-filtresi.md)          | P1-10       | M     |
| 21  | [Başlıkta AI paylaş menüsü](21-baslik-ai-paylas.md)                          | P1-7        | M     |
| 22  | [Sayfaya atlamalı sayfalama](22-sayfalama.md)                                | P1-9        | S     |
| 23  | [Başlık listesi yoğunluğu](23-liste-yogunlugu.md)                            | P1-11       | S     |
| 24  | [Ana sayfa](24-ana-sayfa.md)                                                 | P0-5        | L     |
| 25  | [DEBE sıralı liste](25-debe-sirali-liste.md)                                 | P2-19       | XS    |
| 26  | [Arama öneri API'si](26-arama-oneri-api.md)                                  | P1-6        | M     |
| 27  | [Header arama autocomplete](27-header-autocomplete.md)                       | P1-6        | L     |
| 29  | [Composer karakter sayacı](29-composer-sayac.md)                             | P2-13       | S     |
| 30  | [Composer referans araç çubuğu](30-composer-toolbar.md)                      | P2-13       | M     |
| 31  | [Composer önizleme](31-composer-onizleme.md)                                 | P2-13       | M     |
| 32  | [Composer taslak saklama](32-composer-taslak.md)                             | P2-13       | S     |
| 33  | [Temada "Sistem" seçeneği](33-tema-sistem.md)                                | P2-20       | S     |
| 34  | [Yazar profili sekmeleri](34-profil-sekmeleri.md)                            | P2-18       | M     |
| 35  | [`/debe` ve `/yazar` akışlarında oy afordansı](35-akislarda-oy-afordansi.md) | —           | M     |

> 28 numara bilerek boş bırakıldı.

## Kapsam dışı

- Kategori / kanal taksonomisi — ayrı planlama turu gerektiriyor (kaynak plan P2-23)
- Entry seviyesinde sosyal paylaşım (X, WhatsApp, LinkedIn, Facebook) — karar gereği yalnız "Linki kopyala"
- Moderasyon ve agent yönetimi arayüzleri (`/moderasyon/*`)

## ⚠ Satır numaraları eskir

Görev dosyaları **orijinal kod tabanına göre** yazıldı. Kuyruk ilerledikçe önceki görevler
satır ekleyip çıkardığı için sonraki dosyaların satır numaraları kayar — ölçülen bir örnekte
7-8 satırlık kayma oluştu.

**Satır numaralarını konum ipucu olarak kullanın, adres olarak değil.** Hedefi metinden
bulun (`grep -n "aranan"`), numaraya güvenmeyin. Tarif edilen şey yerinde ama koordinatı
kaymış olabilir. Numara tutmuyor diye "bu iş zaten yapılmış" sonucuna varmayın.

Aynı sebeple dosya listeleri de eksik olabilir: bir sonraki görev yeni bir kullanım yeri
eklemiş olabilir. Kendi taramanızı yapın.

**Daha kötüsü: referans gösterilen kod silinmiş olabilir.** Görev dosyaları birbirine
"şu dosyadaki deseni izleyin" diye atıf yapıyor, ama kuyruktaki başka bir görev o deseni
kaldırmış olabilir. Ölçülen örnek: görev 32, `site-shell.tsx`'teki `localStorage` desenini
referans veriyordu; görev 07 o kodu tamamen sildi. Atıf yapılan kodun **hâlâ orada olduğunu**
doğrulayın; yoksa aynı deseni taşıyan başka bir dosya bulun ve raporunuzda bildirin.

## Her görevde geçerli kurallar

- Dal aç, `main`'e doğrudan commit etme.
- `pnpm` PATH'te olmayabilir; `corepack pnpm` kullanın.
- Bitirmeden önce: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test:unit`
- `corepack pnpm test` (tam paket) ve `test:e2e` yerel olarak **çalışmaz** — `TEST_DATABASE_URL`
  gerekiyor ve Playwright tarayıcıları kurulu değil. Bilinen baseline: 19-20 entegrasyon dosyası
  toplanamaz, 1 test (`m2-traceability`) bir doküman kapısında kalır. Bunlar sizden kaynaklanmaz.
- Görev dosyasındaki "Dokunmayın" listesine uyun — kapsam kayması bağımlı görevleri kırar.
- Kabul kriteri sağlanmıyorsa görevi bitmiş sayma; neyin engellediğini yaz.
