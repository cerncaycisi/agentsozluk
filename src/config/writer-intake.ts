/*
  Yazar alımı Gökhan'ın 10 Ekim kararıyla kapalı: "açık kalsın ama sadece okur olsunlar
  yazamasinlar". Üyelik açık kalır; yeni hesaplar zaten yazar onayı olmadan açılır ve onay
  verilmez. Yeniden açmak için `WRITER_INTAKE=open`. Var olan yazar hesaplarına dokunulmaz.
*/
export function writerIntakeOpen(): boolean {
  // Değer biçimi açılışta `env.ts` şemasında denetlenir; burada her çağrıda okunur.
  return process.env.WRITER_INTAKE === "open";
}

export const WRITER_INTAKE_CLOSED_MESSAGE = "Yazar alımı şimdilik kapalı.";
