// @vitest-environment jsdom

import { render } from "@testing-library/react";
import type { PropsWithChildren, ScriptHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProductAnalytics } from "@/components/analytics/product-analytics";

vi.mock("next/script", () => ({
  default: (
    props: PropsWithChildren<ScriptHTMLAttributes<HTMLScriptElement> & { strategy?: string }>,
  ) => {
    const scriptProps = { ...props };
    delete scriptProps.strategy;
    delete scriptProps.children;
    return <script {...scriptProps}>{props.children}</script>;
  },
}));

describe("ProductAnalytics", () => {
  it("renders no product analytics tags for internal traffic", () => {
    const { container } = render(<ProductAnalytics enabled={false} nonce="test-nonce" />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).not.toContain("6753780");
    expect(container.textContent).not.toContain("GTM-MTGXSB7H");
  });

  it("renders GTM and Hotjar loaders for eligible public traffic", () => {
    const { container } = render(<ProductAnalytics enabled nonce="test-nonce" />);

    expect(container.textContent).toContain("GTM-MTGXSB7H");
    expect(container.textContent).toContain("6753780");
    expect(container.querySelector("noscript")).not.toBeNull();
  });
});
