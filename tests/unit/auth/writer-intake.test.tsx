// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegisterPage from "@/app/kayit/page";
import { RegisterForm } from "@/components/auth/register-form";
import { environmentSchema } from "@/config/env";
import { writerIntakeOpen } from "@/config/writer-intake";

vi.mock("@/lib/navigation/app-navigation", () => ({
  useAppRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/http/client", () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
  ClientApiError: class extends Error {},
}));

const original = process.env.WRITER_INTAKE;
afterEach(() => {
  cleanup();
  process.env.WRITER_INTAKE = original;
});

describe("yazar alımı (Gökhan 10 Ekim: yeni üyeler yalnız okur)", () => {
  it("defaults to closed in the environment schema and rejects unknown values", () => {
    const base = {
      DATABASE_URL: "postgresql://localhost/test",
      APP_URL: "http://localhost:3000",
      APP_SECRET: "test-secret-with-at-least-thirty-two-bytes",
    };
    expect(environmentSchema.parse(base).WRITER_INTAKE).toBe("closed");
    expect(environmentSchema.safeParse({ ...base, WRITER_INTAKE: "acik" }).success).toBe(false);
  });

  it("is open only for the explicit value", () => {
    process.env.WRITER_INTAKE = "open";
    expect(writerIntakeOpen()).toBe(true);
    process.env.WRITER_INTAKE = "closed";
    expect(writerIntakeOpen()).toBe(false);
    delete process.env.WRITER_INTAKE;
    expect(writerIntakeOpen()).toBe(false);
  });

  it("tells a new member they join as a reader while intake is closed", () => {
    process.env.WRITER_INTAKE = "closed";
    render(RegisterPage());
    expect(
      screen.getByText(
        "Hesabını oluştur; şimdilik okur olarak katılırsın. Yazar alımı şu an kapalı.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/yazar onayından sonra/u)).toBeNull();
  });

  it("shows the reader confirmation after a successful sign-up", async () => {
    render(<RegisterForm writerIntakeOpen={false} />);
    await userEvent.type(screen.getByLabelText("E-posta"), "okur@example.com");
    await userEvent.type(screen.getByLabelText("Kullanıcı adı"), "yeni_okur");
    await userEvent.type(screen.getByLabelText("Görünen ad"), "Yeni Okur");
    await userEvent.type(screen.getByLabelText("Şifre"), "uzun-bir-sifre-1");
    await userEvent.type(screen.getByLabelText("Şifre tekrarı"), "uzun-bir-sifre-1");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Hesap oluştur" }));

    expect(
      await screen.findByText(
        "Kaydın alındı. Yazar alımı şimdilik kapalı; hesabınla oy verebilir, entry'leri favorilerine ekleyebilir, başlık ve yazar takip edebilirsin.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/admin onayına gönderildi/u)).toBeNull();
  });
});
