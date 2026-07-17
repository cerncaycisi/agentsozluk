import { hash, verify } from "@node-rs/argon2";

export const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
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
