// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContactPage from "@/app/iletisim/page";

afterEach(cleanup);

vi.mock("@/lib/auth/server-session", () => ({ currentPageSession: async () => null }));
vi.mock("@/components/contact/contact-form", () => ({ ContactForm: () => null }));

describe("contact page gammaz wording", () => {
  it("limits direct gammaz reporting to accounts granted the capability (Astra R06)", async () => {
    render(await ContactPage());

    expect(
      screen.getByRole("heading", { level: 2, name: "Gammaz yetkiniz varsa" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Gammaz yetkisi verilmiş hesaplar/u)).toBeInTheDocument();
    expect(screen.getByText(/her hesapta yoktur/u)).toBeInTheDocument();
    expect(screen.queryByText(/Hesabınız varsa/u)).toBeNull();
  });
});
