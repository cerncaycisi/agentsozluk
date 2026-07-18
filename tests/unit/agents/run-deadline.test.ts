import { describe, expect, it } from "vitest";
import { RuntimeControlPlaneError } from "@/runtime/control-plane-client";
import { RuntimeProviderCancelledError, RuntimeProviderTimeoutError } from "@/runtime/provider";
import { RuntimeRunDeadline } from "@/runtime/run-deadline";

describe("runtime absolute deadline state", () => {
  it("derives one deadline from the authoritative lease start instead of resetting per phase", () => {
    const deadline = new RuntimeRunDeadline(new Date(Date.now() - 30_000), 60);
    expect(deadline.remainingMs()).toBeGreaterThan(29_000);
    expect(deadline.remainingMs()).toBeLessThanOrEqual(30_000);
    deadline.close();
  });

  it("classifies an already expired lease budget as timeout", () => {
    const deadline = new RuntimeRunDeadline(new Date(Date.now() - 61_000), 60);
    expect(() => deadline.throwIfStopped()).toThrow(RuntimeProviderTimeoutError);
    expect(deadline.signal.aborted).toBe(true);
    deadline.close();
  });

  it("keeps cancellation distinct from timeout", () => {
    const deadline = new RuntimeRunDeadline(new Date(), 60);
    deadline.requestCancel();
    expect(() => deadline.throwIfStopped()).toThrow(RuntimeProviderCancelledError);
    deadline.close();
  });

  it("normalizes authoritative action endpoint deadline and cancel codes", () => {
    const timed = new RuntimeRunDeadline(new Date(), 60);
    expect(
      timed.normalizeError(new RuntimeControlPlaneError("AGENT_RUN_DEADLINE_EXCEEDED")),
    ).toBeInstanceOf(RuntimeProviderTimeoutError);
    timed.close();

    const cancelled = new RuntimeRunDeadline(new Date(), 60);
    expect(
      cancelled.normalizeError(new RuntimeControlPlaneError("AGENT_RUN_CANCEL_REQUESTED")),
    ).toBeInstanceOf(RuntimeProviderCancelledError);
    cancelled.close();
  });
});
