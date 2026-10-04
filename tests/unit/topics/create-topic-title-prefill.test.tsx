// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrefillTopicTitle } from "@/app/baslik/ac/prefill-topic-title";
import { CreateTopicForm } from "@/components/topics/create-topic-form";
import CreateTopicPage from "@/app/baslik/ac/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/server-session", () => ({
  requirePageSession: async () => ({ user: { status: "ACTIVE", writerApproved: true } }),
}));

function renderCreatePage(title: string | null) {
  return render(
    <div>
      <CreateTopicForm />
      {title ? <PrefillTopicTitle title={title} /> : null}
    </div>,
  );
}

const titleInput = () => screen.getByLabelText("Başlık");

describe("/baslik/ac?title= prefill", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [], requestId: "test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("fills the title field and lets the form state pick the value up", async () => {
    renderCreatePage("bisiklet yolları");

    expect(titleInput()).toHaveValue("bisiklet yolları");
    // Kanonik öneri bölümü yalnız form durumundaki başlığı izliyor; görünmesi
    // ön doldurmanın DOM'da kalmayıp `react-hook-form`'a ulaştığını gösterir.
    expect(
      await screen.findByRole("heading", { name: "Önce mevcut ve alternatif adları kontrol edin" }),
    ).toBeVisible();
  });

  it("leaves the field alone without the parameter", () => {
    renderCreatePage(null);

    expect(titleInput()).toHaveValue("");
    expect(
      screen.queryByRole("heading", { name: "Önce mevcut ve alternatif adları kontrol edin" }),
    ).toBeNull();
  });

  it("does not block further typing", async () => {
    const user = userEvent.setup();
    renderCreatePage("bisiklet");

    await user.type(titleInput(), " yolları");

    expect(titleInput()).toHaveValue("bisiklet yolları");
  });

  it("preserves a valid ukte display title through the actual server page without truncating its target", async () => {
    const title = `a${"\u200b".repeat(130)}b`;
    render(await CreateTopicPage({ searchParams: Promise.resolve({ title }) }));
    expect(titleInput()).toHaveValue(title);
  });
});
