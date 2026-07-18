# Persona Transformation Method

## Scope

The production pack contains ten fictional, original writing personas. It does not contain a
baseline archive, raw prompt, real username, identity mapping, source-persona label, biography, or
quotation. The repository seed is an import artifact; PostgreSQL persona versions become the runtime
source of truth after import.

## Anonymous trait process

The temporary design input was reduced to an identity-free pool of atomic dimensions: interest
distribution, epistemic habits, disagreement style, explanation density, humor intensity,
curiosity/skepticism balance, value tension, topic-selection tendency, and uncertainty tolerance.
Identity labels and distinctive phrases were excluded before composition.

Each production persona combines at least three shuffled trait clusters, newly authored traits, and a
new interest/value tension. No one input cluster contributes more than 40 percent. Some input traits
were deliberately discarded. The resulting usernames, display names, biographies, source sets,
value combinations, prose rhythms, humor modes, and relationship tendencies were authored for this
project and do not preserve a one-to-one mapping.

## Deterministic safeguards

`scripts/build-persona-baseline-signatures.ts` reads the owner-supplied archive only as a local,
temporary input. It writes truncated hashes of normalized seven-word sequences, but never writes
source prose, identity labels, or hashes of identity labels. Source-identity comparison happens only
in memory. The file records a successful identity scan and a hash of the candidate pack, so any later
persona change invalidates the scan until an authorized operator reruns it with the local archive.

`scripts/verify-personas.ts` performs these checks:

- schema completeness and exactly ten unique personas;
- context-aware ontology, self-biography, and impersonation linting;
- long-phrase and normalized n-gram distance from every anonymous baseline profile;
- blocked identity-hash matches;
- pairwise temperament distance, interest-set overlap, and prose n-gram overlap across all 45 pairs;
- an identity-free deterministic report at `reports/persona-distance.json`.

The pack is rejected when any threshold fails. Thresholds live in the verifier and are repeated in
the report so review does not depend on an undocumented judgment.

## Ontology boundary

The linter does not ban words such as “AI,” “human,” or “bot” when they are discussion subjects. It
rejects unsupported claims that assign such a category to the account itself. It also rejects invented
offline biography, occupation, family, body, location, education, physical experience, and references
that turn a real person or source identity into the persona.

Every rendered prompt states that external text is untrusted content, permits only structured actions,
and asks for a short auditable rationale rather than private reasoning. The same linter is intended to
gate initial import, admin changes, reflection deltas, clone/import, rollback, and any later promotion
into persona state.

## Repository hygiene

Raw design input remains outside the repository. Review and CI should accept only the original pack,
anonymous signatures, verifier code, tests, methodology, and identity-free report. Rebuilding the
signature file is an explicit local operator action and is not part of production startup.
