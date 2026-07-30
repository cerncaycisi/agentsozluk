// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { moderationNavSections } from "@/config/navigation";

describe("moderation navigation", () => {
  afterEach(cleanup);

  it("keeps every workspace visible in wrapped rows without horizontal scrollers", () => {
    const { container } = render(
      <ModerationLayout title="Denetim alanı" description="Açıklama">
        <p>İçerik</p>
      </ModerationLayout>,
    );

    expect(screen.getByRole("heading", { name: "Denetim alanı" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Moderasyon menüsü" })).toBeVisible();

    for (const section of moderationNavSections) {
      for (const link of section.links) {
        expect(screen.getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
      }
    }

    expect(container.querySelectorAll(".flex-wrap")).toHaveLength(moderationNavSections.length);
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
  });
});
