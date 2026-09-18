export const REVIVAL_CONSTITUTIONAL_ARTICLES = [37, 38, 41] as const;
export const APPEAL_CONSTITUTIONAL_ARTICLES = [39, 40, 41, 42] as const;

/*
  `containsModerationDiscussion` KALDIRILDI (18 Eylül 2026, Gökhan kararı).

  Kapı, canlandırma/itiraz gövdesinde "moderasyon tartışması" arayan bir regex
  kümesiydi ve üç bağımsız tur boyunca kapanmadı:

  - Case-fold düzeltmesi `İ`yi doğru katlayınca sıradan sözlük tanımlarını
    (`İtiraz, bir kararın ... başvurudur.`) 422 ile reddetmeye başladı; PR #134'ün
    integration işi bu yüzden kırmızıydı.
  - İki ayrı onarım denendi. Sonek listesini daraltmak kapsamı düşürdü; gövdeyi
    "tanım biçiminde mi" diye sınayan allowlist, tanım cümlesinin ardına eklenen
    `... Kararınız haksız.` metnini akladı.
  - Üçüncü onarım (1./2. kişi koşulu) Türkçe morfolojisinde duvara çarptı:
    kişi ekleri ad yapan eklerden sözlüksüz ayrılamıyor. Ölçülen çarpışmalar —
    `-dım/-tim/-dik` → `eğitim`, `üretim`, `manyetik`, `lojistik` (6/222 gerçek
    entry); `-yım/-yim/-yum` → `kalsiyum`, `uyum`, `giyim`, `deyim`, `sayım`;
    `-iniz` → `feminizm`, `determinizm`, `leninizm`, `darwinizm`. Ek almayan
    2. tekil emir (`İtiraz kararını geri çek!`) zaten yakalanamıyordu.
  - Astra hakemliği ayrıca ~O(n²) maliyet ölçtü: 10.000 karakterlik tek kelimede
    6,3–9,0 sn CPU (taban 0,34–0,73 ms). 422 döndüren bir kapıda bu bir
    erişilebilirlik açığıdır.

  Yerine model tabanlı bir kapı KONMADI. Bu yol senkron bir HTTP yazma yolu ve
  DB transaction'ı içinde; depodaki tek model erişimi `CodexCliProvider`
  (sandbox + kimlik dosyası). Ölçülen ~352 sn'lik DECISION gecikmesi dar bir
  sınıflandırıcının zorunlu maliyetini KANITLAMAZ — içinde CLI denetimi ve
  süreç kurulumu da var (`runtime/provider.ts` başlığı, Astra düzeltmesi) —
  ama mevcut CLI çağrısını bu transaction'a koymak için de gerekçe yok.
  Yargının doğru yeri modelin zaten koştuğu ajan tarafıdır; takip maddesi
  `docs/BACKLOG.md` "Moderasyon-meta yargısı" satırında.

  Aynı kusur sınıfının kardeş kapıda da yazılı olduğunu unutma:
  `docs/OFFLINE_FIRST_PERSON_KAPISI_2026-09-16.md`.
*/
