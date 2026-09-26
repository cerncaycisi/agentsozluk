import { Prisma } from "@prisma/client";

/*
  `entries`/`topics.publicId` veritabanında BIGINT'tir (great reset üretim
  tasarımı v18, madde 3): reset sonrası yeni içerik `2147483648`'den başlar.
  Prisma bu sütunu `bigint` olarak döndürür; public API, URL ve istemci
  alanları ise `number` kalır. Dönüşüm yalnız bu veri erişim sınırında ve
  yalnız `Number.isSafeInteger` koşuluyla yapılır: güvenli aralık dışındaki
  değer sessizce yuvarlanmaz, hata verir. Böylece `JSON.stringify` bigint
  hatası, bigint/number karşılaştırması veya Map anahtarı uyuşmazlığı
  uygulama katmanına sızmaz.
*/

export class UnsafePublicIdError extends Error {
  constructor() {
    super("PUBLIC_ID_UNSAFE");
    this.name = "UnsafePublicIdError";
  }
}

export function publicIdToNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || BigInt(result) !== value) throw new UnsafePublicIdError();
  return result;
}

type PublicIdField<T> = T extends bigint ? number : T extends null ? T : NumericPublicIds<T>;

/*
  Prisma'nın düz veri olmayan sonuç değerleri (Date, Decimal, Buffer/Uint8Array) çalışma anında
  olduğu gibi kalır; tip de onları olduğu gibi bırakır. Fonksiyonlar opaktır, böylece eşlenen
  nesnelerde metot imzaları bozulmaz. Genel `toJSON` ölçütü kullanılmaz: düz nesnede çalışma
  anı dönüştürürken tipin dönüştürmemesine yol açar (Astra, PR #227 2. tur P3).
*/
type OpaqueValue = Date | Uint8Array | Prisma.Decimal | ((...args: never[]) => unknown);

/** `publicId: bigint` alanlarını her derinlikte `publicId: number` yapan tip. */
export type NumericPublicIds<T> = T extends OpaqueValue
  ? T
  : T extends readonly unknown[]
    ? { [Index in keyof T]: NumericPublicIds<T[Index]> }
    : T extends object
      ? {
          [Key in keyof T]: Key extends "publicId"
            ? PublicIdField<T[Key]>
            : NumericPublicIds<T[Key]>;
        }
      : T;

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function convert(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(convert);
  if (value === null || typeof value !== "object") return value;
  if (!isPlainObject(value)) {
    // Yalnız Prisma'nın gerçekten döndürdüğü opak değerler geçer. Başka bir sınıf örneği tipte
    // eşlenirken çalışma anında dönüştürülemezdi; sessizce geçmek yerine dur (Astra, 3. tur P3).
    if (value instanceof Date || value instanceof Uint8Array || Prisma.Decimal.isDecimal(value)) {
      return value;
    }
    throw new UnsafePublicIdError();
  }
  // `Object.fromEntries` anahtarları tanımlar; JSON'daki `__proto__` prototip setter'ını çalıştırmaz.
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [
      key,
      key === "publicId" && typeof field === "bigint" ? publicIdToNumber(field) : convert(field),
    ]),
  );
}

/**
 * Repository sonucundaki bütün `publicId` alanlarını (iç içe ilişkiler dahil)
 * güvenli `number`'a çevirir. Date gibi düz olmayan nesnelere ve diğer bigint
 * alanlara dokunmaz.
 */
export function withNumericPublicIds<T>(value: T): NumericPublicIds<T> {
  return convert(value) as NumericPublicIds<T>;
}
