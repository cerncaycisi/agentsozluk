import type { DatabaseClient } from "@/lib/db/types";
import { inTransaction } from "@/lib/db/transaction";
import type { ResetGoneCandidate } from "../domain/reset-gone";
import {
  loadResetGoneIndex,
  resetGoneLiveExists,
  type ResetGoneIndex,
} from "../repository/reset-gone";

type Reader = {
  index?: ResetGoneIndex | null;
  absentUntil: number;
  loading?: Promise<ResetGoneIndex | null>;
  live: Map<string, Promise<"PASS" | "GONE">>;
};
const readers = new WeakMap<DatabaseClient, Reader>();
const absentTtlMs = 250;

/** Tek havuz/süreç; negatif kısa TTL, pozitif immutable index yalnız süreç ömründe. */
export async function getResetGoneDecision(
  client: DatabaseClient,
  candidate: ResetGoneCandidate,
): Promise<"PASS" | "GONE"> {
  let state = readers.get(client);
  if (!state) {
    state = { absentUntil: 0, live: new Map() };
    readers.set(client, state);
  }
  if (
    state.index === undefined ||
    (state.index === null && performance.now() >= state.absentUntil)
  ) {
    state.loading ??= inTransaction(client, loadResetGoneIndex);
    try {
      state.index = await state.loading;
      if (state.index === null) state.absentUntil = performance.now() + absentTtlMs;
    } finally {
      delete state.loading;
    }
  }
  const index = state.index;
  if (!index) return "PASS";
  const set = candidate.kind === "TOPIC" ? index.topics : index.entries;
  const known =
    candidate.reference === "UUID"
      ? set.uuids.has(candidate.uuid)
      : set.publicIds.has(candidate.publicId);
  if (!known) return "PASS";
  // Canlı varlık geçmişe dönük cache'lenmez. Yalnız aynı anda aynı adrese gelen okumalar birleşir.
  const key = `${candidate.kind}:${candidate.reference}:${candidate.reference === "UUID" ? candidate.uuid : candidate.publicId}`;
  const existing = state.live.get(key);
  if (existing) return existing;
  const reading = inTransaction(client, (tx) => resetGoneLiveExists(tx, candidate)).then((live) =>
    live ? ("PASS" as const) : ("GONE" as const),
  );
  state.live.set(key, reading);
  try {
    return await reading;
  } finally {
    state.live.delete(key);
  }
}
