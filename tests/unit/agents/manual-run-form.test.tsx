// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ManualAgentRunForm } from "@/components/agents/agent-admin-forms";
import { manualAgentRunSchema } from "@/modules/agents/validation/scheduling-schemas";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("manual run form contract", () => {
  it("renders no preview before a request and derives DAILY_CATCH_UP target from the daily plan", async () => {
    render(<ManualAgentRunForm agentId="00000000-0000-4000-8000-000000000101" />);

    expect(screen.queryByText(/target miss etkisi/iu)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Run türü"), "DAILY_CATCH_UP");
    expect(screen.getByDisplayValue("Günlük plandan otomatik")).toBeDisabled();
    expect(manualAgentRunSchema.parse({ runType: "DAILY_CATCH_UP", entryTarget: 0 })).toMatchObject(
      { runType: "DAILY_CATCH_UP", entryTarget: 0 },
    );
  });
});
