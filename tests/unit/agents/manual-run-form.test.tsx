// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManualAgentRunForm } from "@/components/agents/agent-admin-forms";
import { manualAgentRunSchema } from "@/modules/agents/validation/scheduling-schemas";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("manual run form contract", () => {
  it("does not expose or accept retired daily catch-up runs", () => {
    render(<ManualAgentRunForm agentId="00000000-0000-4000-8000-000000000101" />);

    expect(screen.queryByText(/target miss etkisi/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "DAILY_CATCH_UP" })).not.toBeInTheDocument();
    expect(() =>
      manualAgentRunSchema.parse({ runType: "DAILY_CATCH_UP", entryTarget: 0 }),
    ).toThrow();
  });
});
