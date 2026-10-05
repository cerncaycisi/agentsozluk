/** Public kimliklerin PostgreSQL BIGINT → güvenli JSON number repository sınırı. */
type PublicIdValue<T> = T extends bigint ? number : T;
export type PublicIds<T> = T extends Date
  ? T
  : T extends readonly (infer Item)[]
    ? PublicIds<Item>[]
    : T extends object
      ? { [Key in keyof T]: Key extends "publicId" ? PublicIdValue<T[Key]> : PublicIds<T[Key]> }
      : T;

export function publicIdNumber(value: bigint | number): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted <= 0) {
    throw new Error("PUBLIC_ID_OUT_OF_RANGE");
  }
  return converted;
}

export function publicIdBigInt(value: number): bigint {
  return BigInt(publicIdNumber(value));
}

/** Diğer BIGINT alanlarını (ledger id vb.) ve Date nesnelerini değiştirmez. */
export function convertPublicIds<T>(value: T): PublicIds<T> {
  if (Array.isArray(value)) return value.map(convertPublicIds) as PublicIds<T>;
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== null &&
      Object.getPrototypeOf(value).constructor?.name !== "Object")
  ) {
    return value as PublicIds<T>;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "publicId" && typeof item === "bigint"
        ? publicIdNumber(item)
        : convertPublicIds(item),
    ]),
  ) as PublicIds<T>;
}

export async function publicIds<T>(query: PromiseLike<T>): Promise<PublicIds<T>> {
  return convertPublicIds(await query);
}
