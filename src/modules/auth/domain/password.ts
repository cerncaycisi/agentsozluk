import { AsyncLocalStorage } from "node:async_hooks";
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

  KUYRUKTA BEKLEMEK BİR VERİTABANI TRANSACTION'I İÇİNDE OLMAMALI: beklemek
  transaction'ı ve onun bağlantısını tutar, havuz doluyken kilitlenmeye döner.
  İlk çözümüm bunu transaction içindeki çağrıları KAPIDAN MUAF TUTARAK
  halletmişti ve **korumayı en çok gereken yolda yok ediyordu**: mevcut bir
  hesabın doğrulaması hep transaction içinde olduğu için hiç sınırlanmıyor,
  yalnız "hesap yok" dalındaki dummy hash sayılıyordu (Sol, 20 Eylül).

  Doğrusu: permit TRANSACTION AÇILMADAN ÖNCE alınır ve iş boyunca tutulur.
  `withArgon2Permit` bunu yapar.

  VE PERMIT YENİDEN GİRİLEBİLİR. İlk sürümde bunu ayrı isimli fonksiyonlarla
  (`*HoldingPermit`) çözmüştüm; yani doğruluk isim disiplinine bağlıydı ve bir
  yeri kaçırmak yetiyordu. Kaçırdım da: hesap kapatma transaction'ının içinde
  kalan bir `hashPassword` çağrısı ikinci permit istedi, iki eşzamanlı istek
  iki permit'i tutup üçüncüyü bekleyince KİLİTLENDİ — CI'da iki entegrasyon
  testi 15 saniyede zaman aşımına uğradı (20 Eylül).

  Artık `AsyncLocalStorage` ile "bu akışta permit zaten var mı" bakılıyor.
  Varsa yeni permit istenmez, doğrudan koşulur. Böylece çağıranın hangi ismi
  seçtiği önemsizleşir: iç içe çağrı kilitlenemez, sarmalanmamış çağrı da
  sınırsız kalmaz. Bedeli permit'in veritabanı süresi boyunca da tutulmasıdır;
  giriş seyrek olduğu için bilinçli kabul.
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

/*
  Bağlam "geçmişte permit vardı" değil, "ŞU AN geçerli bir permit var" tutar.
  İlk sürüm `true` saklıyordu: permit içinde kurulan bir zamanlayıcı dış iş
  bittikten SONRA ateşlenirse hâlâ `true` görüp kapıyı atlıyordu (Sol, 21 Eylül,
  salt okunur Node probuyla gösterdi). Bugünkü çağrı grafiğinde bunu tetikleyen
  yol yok — her iş await ediliyor — ama güvenlik ilkelinin sözleşmesi buna
  dayanmamalı. Artık bir kira nesnesi tutuluyor; bırakıldığında `bitti` olur ve
  geç ateşlenen torun kapıya yeniden girer.
*/
interface Argon2Kirasi {
  bitti: boolean;
}
const permitBaglami = new AsyncLocalStorage<Argon2Kirasi>();

async function argon2Kapisi<T>(is: () => Promise<T>): Promise<T> {
  // Yeniden giriş: bu akışta HÂLÂ GEÇERLİ bir permit varsa ikincisini isteme.
  const mevcut = permitBaglami.getStore();
  if (mevcut && !mevcut.bitti) return is();
  await permitAl();
  const kira: Argon2Kirasi = { bitti: false };
  try {
    return await permitBaglami.run(kira, is);
  } finally {
    kira.bitti = true;
    permitBirak();
  }
}

export function hashPassword(password: string): Promise<string> {
  return argon2Kapisi(() => hash(password, ARGON2_OPTIONS));
}

/*
  Permit'i açıkça alır ve iş bitene kadar tutar. Veritabanı transaction'ı açacak
  çağıranlar bunu transaction'dan ÖNCE sarmalayıcı olarak kullanır.
*/
export function withArgon2Permit<T>(is: () => Promise<T>): Promise<T> {
  return argon2Kapisi(is);
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
