import { generateKeyPairSync, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  sealRuntimeCredential,
  unsealRuntimeCredential,
} from "@/modules/agents/domain/runtime-credential-enrollment";
import {
  RuntimeControlPlaneError,
  type RuntimeCredentialRosterControlPlane,
} from "@/runtime/control-plane-client";
import { RuntimeCredentialRosterLoader } from "@/runtime/credential-roster";

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    publicKeyDerBase64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

describe("runtime credential enrollment", () => {
  it("seals a credential for exactly one profile and credential identity", () => {
    const keys = keyPair();
    const agentProfileId = randomUUID();
    const credentialId = randomUUID();
    const credential = `agt_${"a".repeat(43)}`;
    const envelope = sealRuntimeCredential(credential, {
      agentProfileId,
      credentialId,
      publicKeyDerBase64: keys.publicKeyDerBase64,
    });

    expect(
      unsealRuntimeCredential(envelope, {
        agentProfileId,
        credentialId,
        privateKeyPem: keys.privateKeyPem,
      }),
    ).toBe(credential);
    expect(() =>
      unsealRuntimeCredential(envelope, {
        agentProfileId,
        credentialId: randomUUID(),
        privateKeyPem: keys.privateKeyPem,
      }),
    ).toThrow();
  });

  it("loads newly enrolled credentials in memory and acknowledges the exact roster", async () => {
    const keys = keyPair();
    const baseline = `agt_${"b".repeat(43)}`;
    const enrolled = `agt_${"n".repeat(43)}`;
    const agentProfileId = randomUUID();
    const credentialId = randomUUID();
    const baselineCredentialId = randomUUID();
    const baselineProfileId = randomUUID();
    const desiredFingerprint = "f".repeat(64);
    const plane: RuntimeCredentialRosterControlPlane = {
      credentialRoster: vi.fn().mockResolvedValue({
        workerId: "worker-a",
        desiredFingerprint,
        activeCredentialIds: [baselineCredentialId, credentialId],
        entries: [
          {
            credentialId,
            agentProfileId,
            prefix: enrolled.slice(0, 16),
            enrollmentCipher: sealRuntimeCredential(enrolled, {
              agentProfileId,
              credentialId,
              publicKeyDerBase64: keys.publicKeyDerBase64,
            }),
          },
        ],
      }),
      credentialIdentity: vi.fn().mockResolvedValue({
        workerId: "worker-a",
        credentialId: baselineCredentialId,
        agentProfileId: baselineProfileId,
      }),
      acknowledgeCredentialRoster: vi.fn().mockResolvedValue(undefined),
    };
    const loader = new RuntimeCredentialRosterLoader({
      controlPlane: plane,
      workerId: "worker-a",
      privateKeyPem: keys.privateKeyPem,
    });

    await expect(loader.refresh([baseline])).resolves.toEqual([baseline, enrolled]);
    await expect(loader.refresh([baseline])).resolves.toEqual([baseline, enrolled]);
    expect(plane.credentialRoster).toHaveBeenCalledWith(baseline, "worker-a");
    expect(plane.credentialIdentity).toHaveBeenCalledOnce();
    expect(plane.acknowledgeCredentialRoster).toHaveBeenCalledWith(
      baseline,
      "worker-a",
      desiredFingerprint,
      [baselineCredentialId, credentialId],
    );
  });

  it("drops a revoked or rejected bootstrap credential from the executable worker set", async () => {
    const keys = keyPair();
    const revoked = `agt_${"r".repeat(43)}`;
    const active = `agt_${"a".repeat(43)}`;
    const activeCredentialId = randomUUID();
    const activeProfileId = randomUUID();
    const plane: RuntimeCredentialRosterControlPlane = {
      credentialRoster: vi.fn().mockImplementation((credential: string) => {
        if (credential === revoked) throw new RuntimeControlPlaneError("AUTH_REQUIRED");
        return Promise.resolve({
          workerId: "worker-a",
          desiredFingerprint: "e".repeat(64),
          activeCredentialIds: [activeCredentialId],
          entries: [],
        });
      }),
      credentialIdentity: vi.fn().mockImplementation((credential: string) => {
        if (credential === revoked) throw new RuntimeControlPlaneError("AUTH_REQUIRED");
        return Promise.resolve({
          workerId: "worker-a",
          credentialId: activeCredentialId,
          agentProfileId: activeProfileId,
        });
      }),
      acknowledgeCredentialRoster: vi.fn().mockResolvedValue(undefined),
    };
    const loader = new RuntimeCredentialRosterLoader({
      controlPlane: plane,
      workerId: "worker-a",
      privateKeyPem: keys.privateKeyPem,
    });

    await expect(loader.refresh([revoked, active])).resolves.toEqual([active]);
    expect(plane.acknowledgeCredentialRoster).toHaveBeenCalledWith(
      active,
      "worker-a",
      "e".repeat(64),
      [activeCredentialId],
    );
  });
});
