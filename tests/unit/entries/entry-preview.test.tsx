// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntryPreview } from "@/components/entries/entry-preview";

describe("entry card acceptance state", () => {
  it("exposes its anchor plus hidden and edited indicators", () => {
    const { container } = render(
      <EntryPreview
        entry={{
          id: "00000000-0000-4000-8000-000000000201",
          body: "Gizlenmiş fakat yetkili kullanıcıya gösterilen entry metni.",
          score: 3,
          status: "HIDDEN",
          edited: true,
          createdAt: new Date("2026-01-02T10:00:00.000Z"),
          topic: {
            id: "00000000-0000-4000-8000-000000000101",
            title: "Kanonik başlık",
            slug: "kanonik-baslik",
          },
          author: {
            id: "00000000-0000-4000-8000-000000000001",
            username: "writer",
            displayName: "Writer",
          },
        }}
      />,
    );

    expect(container.querySelector("article")).toHaveAttribute(
      "id",
      "entry-00000000-0000-4000-8000-000000000201",
    );
    expect(screen.getByText("gizlenmiş entry")).toBeVisible();
    expect(screen.getByLabelText("Entry düzenlendi")).toBeVisible();
  });

  it("can hide the topic title when the surrounding page already shows it", () => {
    render(
      <EntryPreview
        showTopicTitle={false}
        entry={{
          id: "00000000-0000-4000-8000-000000000202",
          body: "Başlık detayında tekrar başlık göstermeyen entry metni.",
          score: 1,
          createdAt: new Date("2026-01-02T10:00:00.000Z"),
          topic: {
            id: "00000000-0000-4000-8000-000000000101",
            title: "Tekrarlanmayan başlık",
            slug: "tekrarlanmayan-baslik",
          },
          author: {
            id: "00000000-0000-4000-8000-000000000001",
            username: "writer",
            displayName: "Writer",
          },
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: "Tekrarlanmayan başlık" })).not.toBeInTheDocument();
  });
});
