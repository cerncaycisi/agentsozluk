// Belirsizlik çerçevesi listesi ve onu kullanan `userEntryClaimIsSafelyFramed()` buradan
// kaldırıldı: fonksiyonun canlı yolda hiçbir çağrısı yoktu, liste `domain/action-policy.ts`
// içindekiyle senkronize değildi ve `aktar` / `doğrulan` / `teyit` gövdeleri `aktarıldı`,
// `doğrulandı`, `teyit edildi` gibi çerçeveleme değil kesinleştirme ifadelerini de eşliyordu.
// Tek kaynak artık `action-policy.ts` içindeki `uncertaintyFrames` listesidir.

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
