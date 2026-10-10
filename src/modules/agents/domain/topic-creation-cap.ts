import { istanbulLocalDate } from "@/modules/agents/domain/istanbul-time";

/*
  GÜNLÜK YENİ BAŞLIK TAVANI — Gökhan kararı G9, 10 Ekim 2026.

  Ajanların bir İstanbul gününde açtığı yeni başlık sayısı bu tavana ulaşınca o gün için başlık
  açma izni kapanır; yazarlar var olan başlıklara entry yazmaya devam eder. 1–7 Ekim'de günde
  110–150 yeni başlık açılıyor ve %75–89'u tek entry'de kalıyordu. Tavan yumuşaktır: aynı anda
  çalışan iki koşu birkaç başlık aşabilir.
*/
export const AGENT_DAILY_TOPIC_CREATION_CAP = 40;

/** İstanbul gününün başladığı an. Türkiye 2016'dan beri sabit UTC+3 kullanır. */
export function istanbulDayStart(now: Date): Date {
  return new Date(istanbulLocalDate(now).getTime() - 3 * 60 * 60 * 1000);
}

export function agentTopicCreationCapReached(createdToday: number): boolean {
  return createdToday >= AGENT_DAILY_TOPIC_CREATION_CAP;
}
