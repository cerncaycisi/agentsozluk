/*
  Operatör komutlarında ilk import: uygulama logger'ı yüklenmeden önce logları stderr'e
  yönlendirir; stdout yalnız sonuç JSON satırına kalır.
*/
process.env.LOG_DESTINATION = "stderr";
export {};
