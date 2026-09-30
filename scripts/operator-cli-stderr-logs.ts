/*
  Operatör komutlarında ilk import: uygulama logger'ı yüklenmeden önce logları stderr'e
  yönlendirir; stdout yalnız sonuç JSON satırına kalır.
*/
process.env.LOG_DESTINATION = "stderr";
// Prisma hata logları console.log ile yazar; stdout sözleşmesini bozmasın (Astra 58b0ac2 P3).
// eslint-disable-next-line no-console -- stdout'u korumak için yönlendirme, çağrı değil.
console.log = (...values: unknown[]) => console.error(...values);
// eslint-disable-next-line no-console -- aynı gerekçe.
console.info = (...values: unknown[]) => console.error(...values);
export {};
