import {
  closeSync,
  constants,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

/*
  Great reset kanıt dosyaları için dayanıklı yazım (Astra, PR #238 P1/P2). `writeSync` istenenden
  az bayt yazabilir; dönüş değeri denetlenmezse eksik içerik başarı sayılır. Burada:
  tam yazım döngüsü → fsync → kapat → geçici dosyayı geri okuyup bayt eşitliği → (gerekirse)
  rename → üst dizin fsync → hedefi geri okuyup bayt eşitliği. Hata hâlinde geçici dosya silinir;
  hedef, doğrulanmamış içerikle hiç değiştirilmez.
*/

function fail(code: string): never {
  throw new Error(`GREAT_RESET_${code}`);
}

function writeFully(handle: number, content: Buffer): void {
  let offset = 0;
  while (offset < content.length) {
    const written = writeSync(handle, content, offset, content.length - offset);
    if (written <= 0) fail("FILE_SHORT_WRITE");
    offset += written;
  }
}

function fsyncDirectory(path: string): void {
  const handle = openSync(dirname(path), constants.O_RDONLY);
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

/** Dosyayı O_EXCL ile oluşturur; oluşturulamazsa (ör. zaten var) hiçbir şeye dokunmadan fırlatır. */
function openNew(path: string): number {
  return openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
}

function fillVerified(path: string, handle: number, content: Buffer): void {
  try {
    writeFully(handle, content);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  if (!readFileSync(path).equals(content)) fail("FILE_READBACK_MISMATCH");
}

/**
 * Yeni dosya (üzerine yazmaz). Yalnız bu çağrının oluşturduğu dosya, doğrulanamazsa silinir;
 * önceden var olan dosyaya hiç dokunulmaz.
 */
export function writeNewDurable(path: string, text: string): void {
  const content = Buffer.from(text, "utf8");
  const handle = openNew(path);
  try {
    fillVerified(path, handle, content);
    fsyncDirectory(path);
  } catch (error) {
    try {
      unlinkSync(path);
    } catch {
      // Dosya hiç oluşmadıysa silinecek bir şey yok.
    }
    throw error;
  }
}

/**
 * Mevcut dosyayı atomik olarak değiştirir. Geçici dosya tam yazılıp geri okunarak doğrulanmadan
 * rename yapılmaz; eski dosya ancak doğrulanmış yeni içerikle yer değiştirir.
 */
export function replaceDurable(path: string, temporary: string, text: string): void {
  const content = Buffer.from(text, "utf8");
  const handle = openNew(temporary);
  try {
    fillVerified(temporary, handle, content);
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // Geçici dosya yoksa (rename sonrası hata) yapılacak bir şey yok.
    }
    throw error;
  }
  fsyncDirectory(path);
  if (!readFileSync(path).equals(content)) fail("FILE_READBACK_MISMATCH");
}
