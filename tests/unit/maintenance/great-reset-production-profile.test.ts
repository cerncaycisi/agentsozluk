import { describe, expect, it } from "vitest";
import { runProductionGreatReset } from "@/modules/maintenance/repository/great-reset";

// Bağlantı ya da dosya/Docker okuması olmadan profil ve host kapısında durulmalı.
const releaseSha = "a".repeat(40);
const namespace = {
  operationId: "3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b",
  releaseSha,
  receiptSha256: "c".repeat(64),
};

describe("production great reset profile gate", () => {
  it("requires namespace and connection gate before reading the environment", async () => {
    for (const request of [
      { mode: "DRY_RUN" as const, connectionGate: true as const },
      { mode: "DRY_RUN" as const, namespace },
    ])
      await expect(runProductionGreatReset(request)).rejects.toThrow(
        "GREAT_RESET_PRODUCTION_PROFILE_REQUIRED",
      );
  });

  it("builds the target itself and refuses any host other than production", async () => {
    await expect(
      runProductionGreatReset({ mode: "DRY_RUN", connectionGate: true, namespace }),
    ).rejects.toThrow("GREAT_RESET_PRODUCTION_HOST_REQUIRED");
  });
});
