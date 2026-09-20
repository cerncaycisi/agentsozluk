import { hash, verify } from "@node-rs/argon2";

export const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

let dummyHash: Promise<string> | undefined;

/*
  ARGON2 EŞZAMANLILIK SINIRI — 20 Eylül 2026 (18 Eylül incelemesi B3).

  `@node-rs/argon2` işi libuv iş parçacığı havuzunda koşar. Her giriş denemesi
  64 MiB / t=3 bir iş doğurur — e-posta hiç yoksa bile, çünkü zamanlama
  sızıntısını kapatmak için dummy hash doğrulanır. Sınırsız bırakıldığında asıl
  zarar bellek değil DOYGUNLUKTUR: havuz dolunca aynı havuzu kullanan dosya ve
  DNS işleri de gecikir. Uygulama, PostgreSQL ve worker aynı kutuda.

  PERMIT DOĞRUDAN DEVREDİLİR. İlk yazımda biten iş sayacı azaltıp kuyruktakini
  uyandırıyordu; uyanan iş sayacı artırana kadar geçen mikro-görev aralığında
  YENİ GELEN bir iş boş slot görüp geçebiliyordu ve tepe 3'e çıkıyordu (Sol,
  20 Eylül, karşı örnekle). Artık sayaç hiç boşalmıyor: biten iş permit'i
  kuyruktaki ilk bekleyene devreder, kuyruk boşsa sayacı azaltır. Aradaki
  pencere yok.

  SINIRIN KAPSAMI SÜREÇTİR. N kopya koşarsa toplam sınır 2N olur; oran sınırı
  kovaları paylaşılan veritabanındadır, bu kapı değildir. Bugünkü container
  girişi tek `node server.js` süreci koşuyor (`scripts/docker-entrypoint.sh`).
  `UV_THREADPOOL_SIZE` repoda sabitlenmemiştir, yani "havuzun yarısı" yalnız
  varsayılan ortam için doğrudur.

  KUYRUKTA BEKLEMEK BİR VERİTABANI TRANSACTION'I İÇİNDE OLMAMALI:
  `verifyPassword` şu an `authenticate.ts` içinde transaction'ın içinden
  çağrılıyor ve beklemek bağlantıyı tutar. `verifyPasswordOutsideTransaction`
  bu yüzden ayrı durur ve çağıranın transaction dışında olduğunu adıyla beyan
  eder; kapı yalnız orada kuyruğa alır.
*/
const ARGON2_ESZAMANLILIK = 2;
let aktif = 0;
const bekleyenler: Array<() => void> = [];

async function permitAl(): Promise<void> {
  if (aktif < ARGON2_ESZAMANLILIK) {
    aktif += 1;
    return;
  }
  // Uyandığında permit ZATEN bizimdir; sayaç devir sırasında hiç azalmadı.
  await new Promise<void>((resolve) => bekleyenler.push(resolve));
}

function permitBirak(): void {
  const sonraki = bekleyenler.shift();
  if (sonraki) {
    sonraki(); // permit doğrudan devredildi, `aktif` sabit kalır
    return;
  }
  aktif -= 1;
}

async function argon2Kapisi<T>(is: () => Promise<T>): Promise<T> {
  await permitAl();
  try {
    return await is();
  } finally {
    permitBirak();
  }
}

export function hashPassword(password: string): Promise<string> {
  return argon2Kapisi(() => hash(password, ARGON2_OPTIONS));
}

/*
  Kapıdan GEÇMEYEN sürüm. Çağıran açık bir veritabanı transaction'ı içindeyse
  bunu kullanmalıdır: kuyrukta beklemek transaction'ı ve onun bağlantısını
  tutar, havuz doluyken bu kilitlenmeye döner. Maliyet koruması o yolda
  çağrı sayısını sınırlayan oran kovalarıdır.
*/
export function hashPasswordInTransaction(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPasswordInTransaction(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2Kapisi(() => verify(passwordHash, password, ARGON2_OPTIONS));
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(passwordHash: string): boolean {
  const parameters = passwordHash.match(/m=(\d+),t=(\d+),p=(\d+)/u);
  if (!parameters) return true;
  return parameters[1] !== "65536" || parameters[2] !== "3" || parameters[3] !== "1";
}

export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("agent-sozluk-dummy-password");
  return dummyHash;
}
