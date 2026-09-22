// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "@/app/gizlilik/page";

afterEach(cleanup);

describe("privacy page analytics disclosure", () => {
  it("explains consent-gated measurement, identity exclusion and the reset control", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByText(/yalnız siz çerez şeridinde “Kabul et” dediğinizde yüklenir/u),
    ).toBeVisible();
    expect(screen.getByText(/Do Not Track veya Global Privacy Control/u)).toBeVisible();
    expect(screen.getByText(/180 gün saklanır/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Çerez tercihimi sıfırla" })).toBeVisible();
    expect(document.body.textContent).not.toMatch(/Hotjar/u);
  });
});
