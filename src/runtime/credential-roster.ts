import {
  RuntimeControlPlaneError,
  type RuntimeCredentialRosterControlPlane,
  type RuntimeWorkerTelemetry,
} from "@/runtime/control-plane-client";
import { unsealRuntimeCredential } from "@/modules/agents/domain/runtime-credential-enrollment";

const runtimeCredentialPattern = /^agt_[A-Za-z0-9_-]{40,100}$/u;

export class RuntimeCredentialRosterLoader {
  readonly #controlPlane: RuntimeCredentialRosterControlPlane;
  readonly #workerId: string;
  readonly #privateKeyPem: string | Buffer;
  readonly #workerTelemetry: RuntimeWorkerTelemetry | undefined;
  #managedCredentials: string[] = [];
  readonly #baselineCredentialIds = new Map<string, string>();
  readonly #rejectedBaselineCredentials = new Set<string>();

  constructor(input: {
    controlPlane: RuntimeCredentialRosterControlPlane;
    workerId: string;
    privateKeyPem: string | Buffer;
    workerTelemetry?: RuntimeWorkerTelemetry;
  }) {
    this.#controlPlane = input.controlPlane;
    this.#workerId = input.workerId;
    this.#privateKeyPem = input.privateKeyPem;
    this.#workerTelemetry = input.workerTelemetry;
  }

  async refresh(baselineCredentials: string[]): Promise<string[]> {
    const authenticationCandidates = [
      ...new Set([...baselineCredentials, ...this.#managedCredentials]),
    ];
    let authenticationCredential: string | null = null;
    let roster: Awaited<
      ReturnType<RuntimeCredentialRosterControlPlane["credentialRoster"]>
    > | null = null;
    for (const credential of authenticationCandidates) {
      try {
        roster = await this.#controlPlane.credentialRoster(credential, this.#workerId);
        authenticationCredential = credential;
        break;
      } catch (error) {
        if (
          error instanceof RuntimeControlPlaneError &&
          ["AUTH_REQUIRED", "FORBIDDEN"].includes(error.code)
        )
          continue;
        throw error;
      }
    }
    if (!roster || !authenticationCredential)
      throw new Error("Runtime credential roster için geçerli bootstrap credential bulunamadı.");

    const activeCredentialIds = new Set(roster.activeCredentialIds);
    const baselineCredentialIds: string[] = [];
    const loadedBaselineCredentials: string[] = [];
    for (const credential of baselineCredentials) {
      const cachedId = this.#baselineCredentialIds.get(credential);
      if (cachedId && activeCredentialIds.has(cachedId)) {
        baselineCredentialIds.push(cachedId);
        loadedBaselineCredentials.push(credential);
        continue;
      }
      this.#baselineCredentialIds.delete(credential);
      if (this.#rejectedBaselineCredentials.has(credential)) continue;
      try {
        const identity = await this.#controlPlane.credentialIdentity(credential, this.#workerId);
        if (activeCredentialIds.has(identity.credentialId)) {
          this.#baselineCredentialIds.set(credential, identity.credentialId);
          baselineCredentialIds.push(identity.credentialId);
          loadedBaselineCredentials.push(credential);
        }
      } catch (error) {
        if (
          error instanceof RuntimeControlPlaneError &&
          ["AUTH_REQUIRED", "FORBIDDEN"].includes(error.code)
        ) {
          this.#rejectedBaselineCredentials.add(credential);
          continue;
        }
        throw error;
      }
    }
    const managedCredentials = roster.entries.map((entry) => {
      const credential = unsealRuntimeCredential(entry.enrollmentCipher, {
        agentProfileId: entry.agentProfileId,
        credentialId: entry.credentialId,
        privateKeyPem: this.#privateKeyPem,
      });
      if (!runtimeCredentialPattern.test(credential) || !credential.startsWith(entry.prefix))
        throw new Error("Runtime credential roster envelope doğrulaması başarısız.");
      return credential;
    });
    const loadedCredentialIds = [
      ...new Set([
        ...baselineCredentialIds,
        ...roster.entries.map(({ credentialId }) => credentialId),
      ]),
    ];
    if (this.#workerTelemetry)
      await this.#controlPlane.acknowledgeCredentialRoster(
        authenticationCredential,
        this.#workerId,
        roster.desiredFingerprint,
        loadedCredentialIds,
        this.#workerTelemetry,
      );
    else
      await this.#controlPlane.acknowledgeCredentialRoster(
        authenticationCredential,
        this.#workerId,
        roster.desiredFingerprint,
        loadedCredentialIds,
      );
    this.#managedCredentials = managedCredentials;
    return [...new Set([...loadedBaselineCredentials, ...managedCredentials])];
  }
}
