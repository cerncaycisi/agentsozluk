import type { DatabaseExecutor } from "@/lib/db/types";
import { inTransaction } from "@/lib/db/transaction";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { runtimeSourceHolderLimit } from "@/modules/agents/domain/runtime-source-candidates";
import { summarizeSourceDiversity } from "@/modules/agents/domain/source-diversity";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import {
  countSourceTurnover,
  listActiveAgentSourceRows,
} from "@/modules/agents/repository/runtime";

const TURNOVER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Kanonik paketlerin kendisi sınırı aşabilir (turkiye.un.org altı pakette): izinli sahip sayısı.
const canonicalPackHolders = new Map<string, number>();
for (const persona of originalPersonaPack.personas)
  for (const { url } of persona.sources)
    canonicalPackHolders.set(url, (canonicalPackHolders.get(url) ?? 0) + 1);

/** Kaynak çeşitliliği özeti (yönetici). Değişiklik yapmaz. */
export function getSourceDiversity(
  client: DatabaseExecutor,
  actor: ActorContext,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const [active, turnover] = await Promise.all([
      listActiveAgentSourceRows(transaction),
      countSourceTurnover(transaction, new Date(now.getTime() - TURNOVER_WINDOW_MS)),
    ]);
    return {
      ...summarizeSourceDiversity(active, {
        holderLimit: runtimeSourceHolderLimit,
        allowedHolders: (url) => canonicalPackHolders.get(url) ?? 0,
      }),
      dormantSources: turnover.dormant,
      replacementsLast7Days: turnover.replacements,
    };
  });
}
