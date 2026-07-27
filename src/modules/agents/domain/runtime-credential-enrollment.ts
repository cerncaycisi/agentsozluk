import {
  constants,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
} from "node:crypto";
import { sha256 } from "@/lib/security/crypto";

const ENVELOPE_VERSION = "v1";

function enrollmentLabel(agentProfileId: string, credentialId: string): Buffer {
  return Buffer.from(`agent-sozluk-runtime:${agentProfileId}:${credentialId}`, "utf8");
}

export function sealRuntimeCredential(
  credential: string,
  input: {
    agentProfileId: string;
    credentialId: string;
    publicKeyDerBase64: string;
  },
): string {
  const publicKey = createPublicKey({
    key: Buffer.from(input.publicKeyDerBase64, "base64"),
    format: "der",
    type: "spki",
  });
  const ciphertext = publicEncrypt(
    {
      key: publicKey,
      oaepHash: "sha256",
      oaepLabel: enrollmentLabel(input.agentProfileId, input.credentialId),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(credential, "utf8"),
  );
  return `${ENVELOPE_VERSION}.${ciphertext.toString("base64url")}`;
}

export function unsealRuntimeCredential(
  envelope: string,
  input: {
    agentProfileId: string;
    credentialId: string;
    privateKeyPem: string | Buffer;
  },
): string {
  const [version, ciphertext, ...extra] = envelope.split(".");
  if (version !== ENVELOPE_VERSION || !ciphertext || extra.length > 0)
    throw new Error("Runtime credential enrollment envelope sürümü geçersiz.");
  const privateKey = createPrivateKey(input.privateKeyPem);
  return privateDecrypt(
    {
      key: privateKey,
      oaepHash: "sha256",
      oaepLabel: enrollmentLabel(input.agentProfileId, input.credentialId),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(ciphertext, "base64url"),
  ).toString("utf8");
}

export interface RuntimeCredentialRosterEntry {
  credentialId: string;
  agentProfileId: string;
  prefix: string;
  enrollmentCipher: string;
}

export function runtimeCredentialRosterFingerprint(
  entries: readonly Pick<
    RuntimeCredentialRosterEntry,
    "credentialId" | "agentProfileId" | "prefix"
  >[],
): string {
  return sha256(
    entries
      .map(
        ({ credentialId, agentProfileId, prefix }) => `${credentialId}|${agentProfileId}|${prefix}`,
      )
      .sort()
      .join("\n"),
  );
}
