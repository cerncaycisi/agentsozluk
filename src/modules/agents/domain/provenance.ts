const uncertaintyFrames = [
  "iddia",
  "öne sür",
  "aktar",
  "doğrulan",
  "belirsiz",
  "teyit",
  "kaynağa göre",
];

export function userEntryClaimIsSafelyFramed(body: string): boolean {
  const normalized = body.normalize("NFKC").toLocaleLowerCase("tr-TR");
  return uncertaintyFrames.some((frame) => normalized.includes(frame));
}

export function relationshipProvenanceIsVisible(evidenceType: string): boolean {
  return evidenceType === "USER_ENTRY" || evidenceType === "PLATFORM_EVENT";
}

export function provenanceIsRequired(actionType: string): boolean {
  return [
    "CREATE_ENTRY",
    "CREATE_TOPIC_WITH_ENTRY",
    "EDIT_OWN_ENTRY",
    "PROPOSE_SOURCE",
    "UPDATE_BELIEF",
    "UPDATE_RELATIONSHIP_NOTE",
  ].includes(actionType);
}
