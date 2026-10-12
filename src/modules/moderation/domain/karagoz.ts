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
