// @vitest-environment jsdom

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
    expect(trigger).toHaveClass("size-10", "shrink-0", "sm:w-auto", "sm:max-w-40");
    expect(screen.getByText("Oldukça Uzun Görünen Kullanıcı Adı")).toHaveClass(
      "hidden",
      "sm:inline",
    );
  });
});
