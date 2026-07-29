// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as HttpClientModule from "@/lib/http/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/login-form";
import { AccountMenu } from "@/components/layout/account-menu";
import { navigateDocument } from "@/lib/browser/document-navigation";
import { apiRequest } from "@/lib/http/client";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("next=/moderasyon"),
}));

vi.mock("@/lib/browser/document-navigation", () => ({
  navigateDocument: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => {
  const original = await importOriginal<typeof HttpClientModule>();
  return { ...original, apiRequest: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("analytics-safe authentication transitions", () => {
  it("loads a fresh authenticated document after login", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("E-posta"), "admin@local.test");
    await user.type(screen.getByLabelText("Şifre"), "StrongPassword123");
    await user.click(screen.getByRole("button", { name: "Giriş yap" }));

    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith("/moderasyon"));
  });

  it("loads a fresh anonymous document after logout", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<AccountMenu viewer={{ username: "admin", displayName: "Admin", role: "ADMIN" }} />);

    await user.click(screen.getByRole("button", { name: "Hesap menüsünü aç" }));
    await user.click(await screen.findByRole("menuitem", { name: "Çıkış yap" }));

    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith("/"));
  });
});
