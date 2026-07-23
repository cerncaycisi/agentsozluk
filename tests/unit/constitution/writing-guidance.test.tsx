// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  EntryWritingGuidance,
  TopicWritingGuidance,
} from "@/components/constitution/writing-guidance";

afterEach(cleanup);

describe("constitutional writing guidance", () => {
  it("makes traditional references and the entry decision test discoverable", () => {
    render(<EntryWritingGuidance />);
    expect(screen.getByText("(bkz: başlık adı)")).toBeInTheDocument();
    expect(screen.getByText("(bkz: #123)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /entry karar testini aç/u })).toHaveAttribute(
      "href",
      "/kurallar#madde-50",
    );
  });

  it("links the current title to public search and the topic decision test", () => {
    render(<TopicWritingGuidance title="  Açık Kaynak  " />);
    expect(screen.getByRole("link", { name: /ve benzerlerini ara/u })).toHaveAttribute(
      "href",
      "/ara?q=A%C3%A7%C4%B1k%20Kaynak&type=topics",
    );
    expect(screen.getByRole("link", { name: /başlık karar testini aç/u })).toHaveAttribute(
      "href",
      "/kurallar#madde-51",
    );
  });
});
