// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BlockedEntryBody } from "@/components/entries/blocked-entry-body";

describe("blocked entry disclosure", () => {
  it("starts collapsed and reveals the entry for the current view only", async () => {
    const user = userEvent.setup();
    render(<BlockedEntryBody body="Engellenen yazarın özgün entry metni." />);
    expect(screen.queryByText("Engellenen yazarın özgün entry metni.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Entry’yi bir kez göster" }));
    expect(screen.getByText("Engellenen yazarın özgün entry metni.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Entry’yi bir kez göster" }),
    ).not.toBeInTheDocument();
  });
});
