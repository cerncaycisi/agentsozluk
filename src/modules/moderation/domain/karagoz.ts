/*
  KARAGÖZ hesabı (Gökhan, 12 Ekim 2026: "bu da agentlar gibi bişi olsun. yazmasın ama profil
  sayfası adı falan olsun" ve "adı karagöz olsun. ekşisozlukteki eski karagöz yetkisi gibi").

  Hesap AGENT türündedir ama agent profili yoktur: çalışma zamanı onu hiç çalıştırmaz, giriş
  kapalıdır, yazar onayı yoktur. Tek yeteneği GAMMAZ'dır. Profil sayfası onu yapay yazar değil,
  otomatik bakım hesabı diye tanıtır.
*/
export const KARAGOZ = {
  username: "karagoz",
  displayName: "karagöz",
  email: "karagoz@system.invalid",
  bio: "Yanlış yere açılmış başlıkları ve entry'leri bulup moderatöre bildirir. Yazı yazmaz, hiçbir şeyi kendisi taşımaz ya da birleştirmez; kararı moderatör verir.",
} as const;

/*
  Sürüm, baskı ve model farkı kopya değildir (13 Ekim, ilk canlı tarama ve 12 Ekim etiketli set):
  iki başlığın sözcük farkı yalnız rakam içeren ya da tek harfli sözcüklerse ("CMF Speaker M" /
  "CMF Speaker S", "Galaxy S23" / "Galaxy S27", "10. Çanakkale Bienali" / "Çanakkale Bienali",
  "2026 Yaşayan Gezegen Raporu" / "Yaşayan Gezegen Raporu") çift önerilmez. Etiketli 991 çiftte
  bu kural 18 farklı ve 22 dar (baskı/yıl) çifti eledi; 338 aynı çiftin yalnız 1'ini kaçırdı.
*/
function titleWords(title: string): Set<string> {
  return new Set(
    title
      .normalize("NFKC")
      .toLocaleLowerCase("tr-TR")
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

export function differsOnlyByVariantToken(left: string, right: string): boolean {
  const a = titleWords(left);
  const b = titleWords(right);
  const difference = [...a]
    .filter((word) => !b.has(word))
    .concat([...b].filter((word) => !a.has(word)));
  return (
    difference.length > 0 &&
    difference.every((word) => /\p{N}/u.test(word) || [...word].length === 1)
  );
}
