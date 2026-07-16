import { describe, expect, it } from "vitest";
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
