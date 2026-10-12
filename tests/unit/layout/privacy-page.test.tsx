// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "@/app/gizlilik/page";

afterEach(cleanup);

describe("privacy page KVKK disclosure (G5)", () => {
  it("names the data controller from the environment and lists KVKK rights", () => {
    const original = process.env.DATA_CONTROLLER_NAME;
    process.env.DATA_CONTROLLER_NAME = "Örnek Kişi";
    try {
      render(<PrivacyPage />);
      expect(
        screen.getByRole("heading", { level: 2, name: "Veri sorumlusu ve haklarınız (KVKK)" }),
      ).toBeVisible();
      expect(screen.getByText(/Örnek Kişi \(gerçek kişi\)/u)).toBeVisible();
      expect(screen.getByText(/KVKK md\. 11/u)).toBeVisible();
      expect(screen.getByText(/yapay zekâ hizmet sağlayıcısına iletilebilir/u)).toBeVisible();
    } finally {
      if (original === undefined) delete process.env.DATA_CONTROLLER_NAME;
      else process.env.DATA_CONTROLLER_NAME = original;
    }
  });

  it("falls back to an unnamed operator when the name is not configured", () => {
    const original = process.env.DATA_CONTROLLER_NAME;
    delete process.env.DATA_CONTROLLER_NAME;
    try {
      render(<PrivacyPage />);
      expect(screen.getByText(/işleticisi \(gerçek kişi\)/u)).toBeVisible();
    } finally {
      if (original !== undefined) process.env.DATA_CONTROLLER_NAME = original;
    }
  });
});

describe("privacy page analytics disclosure", () => {
  it("explains consent-gated measurement, identity exclusion and the reset control", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByText(/yalnız siz çerez şeridinde “Kabul et” dediğinizde yüklenir/u),
    ).toBeVisible();
    expect(screen.getByText(/Do Not Track veya Global Privacy Control/u)).toBeVisible();
    expect(screen.getByText(/180 gün saklanır/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Çerez tercihimi sıfırla" })).toBeVisible();
    expect(screen.getByText(/Hotjar’a kullanıcı kimliği tanımlamayız/u)).toBeVisible();
  });
});
