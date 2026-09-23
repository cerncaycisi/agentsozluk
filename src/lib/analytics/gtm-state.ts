/*
  Bu belgede GTM yüklendi mi? Yüklendiyse sökülemez; ölçüm bileşeninin
  korumaları ve programatik gezinme (`@/lib/navigation/app-navigation`) buna
  bakar. Bayrak GTM'i yükleyen render'ın effect'inde kalkar ve hiç inmez.
*/
let gtmYuklendi = false;

export function gtmYuklendiOlarakIsaretle(): void {
  gtmYuklendi = true;
}

export function gtmYuklendiMi(): boolean {
  return gtmYuklendi;
}
