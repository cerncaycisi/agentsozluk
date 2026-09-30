/*
  Ajan kaynak önerisi (30 Eylül 2026, Gökhan kararı: "istiyorum. sen de onaylayabil").

  Ajanlar kaynağı yalnız birbirinden öğreniyordu; sistem kapalıydı. Okunan haberlerdeki
  bağlantılardan keşif ölçüldü ve sinyal vermedi (%2, 8 alan adı). Ajan artık ilgi alanına
  uyan bir yayının adresini önerebilir; ama öneri ASLA doğrudan okunmaz:

  - sunucu adresi `parseSafeSourceUrl` ile denetler ve DISCOVERED (onay bekliyor)
    olarak kaydeder; DISCOVERED okunmaz, sunulmaz, hiçbir sayıma girmez;
  - yönetici (Gökhan ya da operatör olarak Claude) güvenli okuyucuyla doğrulayıp onaylar
    (SEED) ya da reddeder (REJECTED); onay stok/sahip sınırlarını kapasite kilidi
    altında denetler;
  - bekleyen öneri sınırları kuyruğun şişmesini önler.

  2 Eylül'deki eski serbest URL yolu adresi doğrudan PROBATION yapıyordu (okunur ve
  kaynak gösterilebilir); o yol kaldırıldı.
*/
export const runtimeSourceSuggestionLimits = {
  pendingPerAgent: 2,
  pendingTotal: 40,
} as const;

export const agentSourceProposalOrigin = "AGENT_PROPOSAL";
