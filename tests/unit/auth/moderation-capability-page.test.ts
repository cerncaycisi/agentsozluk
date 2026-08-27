import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";

/*
  Moderasyon sayfalarında iki kapı var. Rol kapısı (`requireModerationPage`)
  reddederse `/yasak`'a yönlendiriyor; yetenek kapısı ise veri yüklenirken
  `AppError(MODERATION_CAPABILITY_REQUIRED, 403)` fırlatıyordu ve sunucu
  bileşeninde yakalanmadığı için Next'in hata sınırına düşüyordu — yetkisi
  olmayan moderatör "yetkiniz yok" yerine beyaz hata sayfası görüyordu.

  Bu testin asıl işi sarmalayıcının DAR olduğunu sabitlemek: yalnız o tek kodu
  çeviriyor, başka her şeyi olduğu gibi bırakıyor. Geniş bir catch gerçek
  500'leri görünmez yapardı ve bu, hatadan daha kötü olurdu.
*/
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDatabase: vi.fn() }));
vi.mock("@/modules/auth/application/sessions", () => ({ authenticateSession: vi.fn() }));

let withModerationCapability: <T>(load: () => Promise<T> | T) => Promise<T>;

describe("withModerationCapability", () => {
  beforeEach(async () => {
    redirect.mockClear();
    ({ withModerationCapability } = await import("@/lib/auth/server-session"));
  });

  it("sends a moderator without the capability to the forbidden page", async () => {
    await expect(
      withModerationCapability(() => {
        throw new AppError(
          "MODERATION_CAPABILITY_REQUIRED",
          403,
          "Bu işlem için FORMAT_MODERATOR capability’si gerekir.",
        );
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/yasak");
    expect(redirect).toHaveBeenCalledWith("/yasak");
  });

  it("returns the loaded value untouched when the capability is present", async () => {
    await expect(withModerationCapability(async () => ({ reports: [1, 2] }))).resolves.toEqual({
      reports: [1, 2],
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  /*
    En önemli iki durum: başka bir `AppError` ve sıradan bir hata. İkisi de
    yeniden fırlatılmalı, yoksa gerçek arıza 403 gibi görünür.
  */
  it("does not swallow other application errors", async () => {
    await expect(
      withModerationCapability(() => {
        throw new AppError("REPORT_NOT_FOUND", 404, "Bildirim bulunamadı.");
      }),
    ).rejects.toMatchObject({ code: "REPORT_NOT_FOUND" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not swallow unexpected failures", async () => {
    await expect(
      withModerationCapability(() => {
        throw new TypeError("veritabanı bağlantısı koptu");
      }),
    ).rejects.toThrow("veritabanı bağlantısı koptu");
    expect(redirect).not.toHaveBeenCalled();
  });

  // Next'in kendi yönlendirme/404 sinyalleri `AppError` değildir, geçmeliler.
  it("lets Next navigation signals pass through", async () => {
    await expect(
      withModerationCapability(() => {
        throw new Error("NEXT_NOT_FOUND");
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirect).not.toHaveBeenCalled();
  });
});
