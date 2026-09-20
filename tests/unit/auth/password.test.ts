import { describe, expect, it, vi } from "vitest";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "@/modules/auth/domain/password";
import { passwordSchema, registrationSchema } from "@/modules/auth/validation/schemas";

describe("password and registration security", () => {
  it("enforces length, letter, number and common-password rules", () => {
    expect(passwordSchema.safeParse("yalnızcaharf").success).toBe(false);
    expect(passwordSchema.safeParse("12345678901").success).toBe(false);
    expect(passwordSchema.safeParse("password123").success).toBe(false);
    expect(passwordSchema.safeParse("Güvenli-Bir-Şifre-2026").success).toBe(true);
  });

  it("normalizes public registration fields and rejects role escalation input", () => {
    const result = registrationSchema.parse({
      email: "  USER@Example.COM ",
      username: "  Yeni_Yazar ",
      displayName: "  Yeni    Yazar ",
      password: "Güvenli-Bir-Şifre-2026",
      passwordConfirmation: "Güvenli-Bir-Şifre-2026",
      termsAccepted: true,
      role: "ADMIN",
    });
    expect(result.email).toBe("user@example.com");
    expect(result.username).toBe("yeni_yazar");
    expect(result.displayName).toBe("Yeni Yazar");
    expect(result).not.toHaveProperty("role");
  });

  it("hashes and verifies using the required Argon2id cost", async () => {
    const passwordHash = await hashPassword("Güvenli-Bir-Şifre-2026");
    expect(passwordHash).toContain("$argon2id$");
    expect(passwordHash).toContain("m=65536,t=3,p=1");
    expect(await verifyPassword(passwordHash, "Güvenli-Bir-Şifre-2026")).toBe(true);
    expect(await verifyPassword(passwordHash, "yanlış-şifre-2026")).toBe(false);
    expect(passwordNeedsRehash(passwordHash)).toBe(false);
    expect(passwordNeedsRehash(passwordHash.replace("m=65536", "m=32768"))).toBe(true);
  });
});

describe("argon2 eşzamanlılık sınırı", () => {
  /*
    İlk sürüm permit'i devretmiyordu: biten iş sayacı azaltıp bekleyeni
    uyandırıyordu ve uyanan sayacı artırana kadar YENİ GELEN bir iş boş slot
    görüp geçebiliyordu. Aşağıdaki test tam o sırayı kurar; eski kodda tepe 3
    olur, devirli sürümde 2 kalır.
  */
  async function kapiyiKur() {
    let anlik = 0;
    let tepe = 0;
    const bekleyen: Array<() => void> = [];
    vi.resetModules();
    vi.doMock("@node-rs/argon2", () => {
      const is = async () => {
        anlik += 1;
        tepe = Math.max(tepe, anlik);
        await new Promise<void>((resolve) => bekleyen.push(resolve));
        anlik -= 1;
        return true as never;
      };
      return { hash: is, verify: is };
    });
    const modul = await import("@/modules/auth/domain/password");
    return { modul, bekleyen, olc: () => tepe };
  }

  /*
    Yarış penceresi MİKRO-GÖREV seviyesinde: permit bırakıldıktan sonra uyanan
    bekleyenin devam etmesine kadar geçen aralıkta yeni bir iş gelirse, devirsiz
    sürümde ikisi birden koşar. Pencerenin kaçıncı tick'e düştüğü çağrı
    zincirinin derinliğine bağlı, bu yüzden tek bir gecikme denemek yetmiyor —
    ilk yazdığım test tam bu yüzden hatalı sürümde de geçiyordu. Offset'leri
    tarıyoruz: hangisinde olursa olsun tepe 2'yi aşmamalı.
  */
  it("bırakma ile uyanma arasındaki her tick'te tepeyi 2'de tutar", async () => {
    for (let offset = 0; offset <= 4; offset += 1) {
      const { modul, bekleyen, olc } = await kapiyiKur();
      const isler: Array<Promise<unknown>> = [
        modul.verifyPassword("h", "bir"),
        modul.verifyPassword("h", "iki"),
      ];
      await new Promise((resolve) => setTimeout(resolve, 0));
      isler.push(modul.verifyPassword("h", "üç")); // kuyruğa girer
      await new Promise((resolve) => setTimeout(resolve, 0));

      bekleyen.shift()?.(); // çalışan bir iş bitmeye başlar
      for (let tick = 0; tick < offset; tick += 1) await Promise.resolve();
      isler.push(modul.verifyPassword("h", "dört")); // geç gelen iş

      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(olc(), `offset=${offset} için tepe`).toBeLessThanOrEqual(2);

      while (bekleyen.length > 0) {
        bekleyen.shift()?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await Promise.all(isler);
      expect(olc(), `offset=${offset} için son tepe`).toBeLessThanOrEqual(2);
    }
    vi.doUnmock("@node-rs/argon2");
    vi.resetModules();
  });

  it("bekleyenleri geldikleri sırayla uyandırır", async () => {
    const { modul, bekleyen } = await kapiyiKur();
    const sira: string[] = [];
    const isaretle = (ad: string) => (sonuc: unknown) => {
      sira.push(ad);
      return sonuc;
    };

    const isler = [
      modul.verifyPassword("h", "a").then(isaretle("a")),
      modul.verifyPassword("h", "b").then(isaretle("b")),
      modul.verifyPassword("h", "c").then(isaretle("c")),
      modul.verifyPassword("h", "d").then(isaretle("d")),
      modul.verifyPassword("h", "e").then(isaretle("e")),
    ];

    while (bekleyen.length > 0 || sira.length < 5) {
      bekleyen.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await Promise.all(isler);
    expect(sira).toEqual(["a", "b", "c", "d", "e"]);
    vi.doUnmock("@node-rs/argon2");
    vi.resetModules();
  });

  it("iş hata verdiğinde permit kuyruktaki bekleyene geçer", async () => {
    vi.resetModules();
    let cagri = 0;
    const bekleyen: Array<() => void> = [];
    vi.doMock("@node-rs/argon2", () => ({
      hash: async () => {
        cagri += 1;
        if (cagri <= 2) throw new Error("argon2 patladı");
        await new Promise<void>((resolve) => bekleyen.push(resolve));
        return "hash";
      },
      verify: async () => {
        throw new Error("argon2 patladı");
      },
    }));
    const modul = await import("@/modules/auth/domain/password");

    const ilkIkisi = [modul.hashPassword("bir"), modul.hashPassword("iki")];
    const ucuncu = modul.hashPassword("üç");
    await expect(Promise.allSettled(ilkIkisi)).resolves.toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Hata yolu permit'i bıraktıysa üçüncü iş başlamış olmalı.
    expect(bekleyen.length).toBe(1);
    bekleyen.shift()?.();
    await expect(ucuncu).resolves.toBe("hash");

    vi.doUnmock("@node-rs/argon2");
    vi.resetModules();
  });

  it("iç içe çağrı ikinci permit istemez ve tepe 2'de kalır", async () => {
    /*
      Sözleşme: `withArgon2Permit` işin tamamını sarar ve İÇERİDEKİ argon2
      çağrıları aynı permit'i yeniden kullanır. İlk tasarımda bunu ayrı isimli
      fonksiyonlarla çözmüştüm; doğruluk isim disiplinine bağlıydı ve bir yeri
      kaçırdım — hesap kapatma transaction'ının içinde kalan bir `hashPassword`
      ikinci permit isteyince iki eşzamanlı istek KİLİTLENDİ (CI, 20 Eylül).

      Bu test o kilitlenmeyi üretir: yeniden giriş olmasaydı üç istek de
      birbirini bekler ve `Promise.all` hiç çözülmezdi.
    */
    const { modul, bekleyen, olc } = await kapiyiKur();

    const istekler = [1, 2, 3].map((n) =>
      modul.withArgon2Permit(async () => {
        await modul.verifyPassword("hash", `sifre-${n}`);
        // İÇ İÇE: gerçek hesap kapatma yolunda olan da tam olarak bu.
        await modul.hashPassword(`yeni-${n}`);
        return n;
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(olc()).toBeLessThanOrEqual(2);

    while (bekleyen.length > 0) {
      bekleyen.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await expect(Promise.all(istekler)).resolves.toEqual([1, 2, 3]);
    expect(olc()).toBeLessThanOrEqual(2);

    vi.doUnmock("@node-rs/argon2");
    vi.resetModules();
  });
});
