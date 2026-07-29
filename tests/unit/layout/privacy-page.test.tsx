// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "@/app/gizlilik/page";

afterEach(cleanup);

describe("privacy page analytics disclosure", () => {
  it("explains anonymous-only measurement and identity exclusion", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/yalnız giriş yapılmamış herkese açık sayfalardaki/u)).toBeVisible();
    expect(screen.getByText(/Hotjar’a kullanıcı kimliği tanımlamayız/u)).toBeVisible();
    expect(screen.getByText(/Do Not Track veya Global Privacy Control/u)).toBeVisible();
  });
});
