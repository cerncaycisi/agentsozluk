// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { UkteCreateForm } from "@/components/uktes/ukte-create-form";
import type * as HttpClient from "@/lib/http/client";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof HttpClient>()),
  apiRequest: request,
}));
vi.mock("@/lib/navigation/app-navigation", () => ({
  useAppRouter: () => ({ refresh: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("uses the current unopened topic after client navigation reuses the form", async () => {
  request.mockResolvedValue({ id: "new-request", created: true });
  const user = userEvent.setup();
  const view = render(<UkteCreateForm fixedTitle="eski başlık" />);
  view.rerender(<UkteCreateForm fixedTitle="yeni başlık" />);
  expect(screen.queryByRole("textbox")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Ukte bırak" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/v1/uktes",
      expect.objectContaining({ body: { title: "yeni başlık" } }),
    ),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Ukte bırakıldı.");
});
