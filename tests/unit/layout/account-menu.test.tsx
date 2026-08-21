// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountMenu } from "@/components/layout/account-menu";

describe("account menu", () => {
  afterEach(cleanup);

  it("hesabı yalnız ikonla gösterir, kimliği menüye taşır", () => {
    render(
      <AccountMenu
        viewer={{
          username: "uzunkullaniciadi",
          displayName: "Oldukça Uzun Görünen Kullanıcı Adı",
          role: "ADMIN",
        }}
      />,
    );

    /*
      Görünen ad 2026-08-21'de header'dan kaldırıldı: sayfanın en az kullanılan
      kontrolüne 120px'e kadar yer veriyordu ve üretilmiş adlarda gürültüye dönüşüyordu.
      İki benchmark da hesabı adla göstermiyor. Kimlik menünün ilk satırında duruyor.
    */
    const trigger = screen.getByRole("button", { name: "Hesap menüsünü aç" });
    /*
      `.icon-button` ZORUNLU: ortalamayı o yapıyor (`grid place-items-center`),
      `-boxed` yalnız kutuyu ekliyor. Bu sınıf düşünce ikon kutunun soluna
      yapışmıştı — canlıda ölçüldü: sol boşluk 1px, sağ boşluk 20px.
      `size-11` yanındaki tema düğmesiyle aynı; ikisi başlıkta yan yana duruyor.
    */
    expect(trigger).toHaveClass("icon-button", "icon-button-boxed", "size-11");
    expect(screen.queryByText("Oldukça Uzun Görünen Kullanıcı Adı")).not.toBeInTheDocument();
  });

  /**
   * "Çıkış yap" bir `DropdownMenu.Item asChild` içinde NATIVE `<button disabled>`;
   * Radix o niteliği görmediği için `data-disabled` bırakmıyor. `.menu-item` yalnız
   * `[data-disabled]`i temizlediğinden düğme istek uçarken hâlâ işaretçi imleci ve
   * hover örtüsü gösteriyordu. Aile artık iki kapıyı da kapatıyor.
   */
  it("devre dışı menü öğesini hem Radix hem native kapıdan sessizleştirir", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toContain(".menu-item[data-disabled],\n  .menu-item:disabled {");
    // Hover örtüsü devre dışı öğede hiç binmiyor.
    expect(css).toContain(".menu-item:hover:not(:disabled),");
  });
});
