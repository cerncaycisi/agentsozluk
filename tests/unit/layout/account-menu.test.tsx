// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountMenu } from "@/components/layout/account-menu";

describe("account menu", () => {
  afterEach(cleanup);

  it("uses a compact mobile trigger while retaining the display name from sm upward", () => {
    render(
      <AccountMenu
        viewer={{
          username: "uzunkullaniciadi",
          displayName: "Oldukça Uzun Görünen Kullanıcı Adı",
          role: "ADMIN",
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Hesap menüsünü aç" });
    expect(trigger).toHaveClass(
      "icon-button-boxed",
      "min-h-10",
      "min-w-10",
      "sm:w-auto",
      "sm:max-w-40",
    );
    expect(screen.getByText("Oldukça Uzun Görünen Kullanıcı Adı")).toHaveClass(
      "hidden",
      "sm:inline",
    );
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
