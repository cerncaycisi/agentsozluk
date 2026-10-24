import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import {
  createFocusList,
  endFocusList,
  focusListCreateSchema,
  getFocusListStatus,
  runtimeControlSchema,
} from "@/modules/agents";
import { resolveOperatorAdmin } from "./agent-operator";
import {
  prepareOperatorCliEnvironment,
  writeOperatorCliEnvironmentReport,
} from "./operator-cli-environment";

/*
  Süreli odak listesi operatör komutu (Gökhan kararı, 19 Ekim 2026: odaklı içerik denemesi
  "erken başla"). Uygulama servisini çağırır; aktör tek aktif HUMAN ADMIN ya da
  AGENT_OPERATOR_ADMIN_ID. Denetim kaydı ve runtime olayı servisin içinde, ayar kilidi
  altında yazılır. Komut yetki değildir: üretimde liste açmak/kapatmak geçerli yetki ister.

    tsx scripts/agent-focus.ts status
    AGENT_FOCUS_REASON='<gerekçe>' tsx scripts/agent-focus.ts create <liste.json | ->
    AGENT_FOCUS_REASON='<gerekçe>' tsx scripts/agent-focus.ts end

  Liste dosyası: {"label": "...", "topics": [5182, "slug--4935"], "agents": ["kullanici"],
  "endsAt": "2026-11-09T09:00:00Z"}. `-` standart girdiden okur (konteyner içinde dosya
  yolu gerekmez). Bitiş en çok 14 gün sonrası; aynı anda tek etkin liste. `end` anında
  geçerlidir: sonraki koşu listeyi görmez.

  Çıktı yalnız liste kimliği, başlık publicId'leri, ajan kullanıcı adları ve sayılardır;
  insan kullanıcı kimliği basılmaz. Hata yalnız güvenli kodla biter.
*/

export type FocusCommand = "status" | "create" | "end";

/** Güvenli hata kodu; ZodError önce (alan yolu ortam adı içerebilir). */
export function focusFailureCode(error: unknown): string {
  if (error instanceof AppError) {
    const reason = error.details?.reason;
    return typeof reason === "string" ? `${error.code} reason=${reason}` : error.code;
  }
  if (error instanceof z.ZodError) return "OPERATOR_INPUT_INVALID";
  if (error instanceof SyntaxError) return "OPERATOR_INPUT_INVALID";
  if (error instanceof Error && error.message.includes("AGENT_OPERATOR_ADMIN_ID"))
    return "OPERATOR_ADMIN_SELECTION_AMBIGUOUS";
  return "INTERNAL_ERROR";
}

const commandSchema = z.enum(["status", "create", "end"]);
const environmentSchema = z
  .object({
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_FOCUS_REASON: z.string().min(1).max(1000).optional(),
  })
  .passthrough();

/** Liste dosyasını okur; gerekçe dosyadan değil ortamdan gelir. */
export function readFocusListInput(source: string, reason: string | undefined, stdin = 0) {
  const raw = readFileSync(source === "-" ? stdin : source, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return focusListCreateSchema.parse({ ...record, reason });
}

function write(line: string) {
  process.stdout.write(`${line}\n`);
}

async function main(): Promise<void> {
  const command = commandSchema.parse(process.argv[2]);
  writeOperatorCliEnvironmentReport(prepareOperatorCliEnvironment());
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    if (command !== "status") {
      const reason = runtimeControlSchema.parse({ reason: environment.AGENT_FOCUS_REASON }).reason;
      const actor = {
        ...(await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID)),
        requestId: randomUUID(),
      };
      if (command === "create") {
        const source = process.argv[3];
        if (!source) throw new AppError("VALIDATION_ERROR", 422, "Liste dosyası gerekli.");
        const list = await createFocusList(database, actor, readFocusListInput(source, reason));
        write(
          `FOCUS_LIST command=create focusListId=${list.id} topics=${list.topicIds.length} ` +
            `agents=${list.agentProfileIds.length} startsAt=${list.startsAt.toISOString()} ` +
            `endsAt=${list.endsAt.toISOString()}`,
        );
      } else {
        const ended = await endFocusList(database, actor, { reason });
        write(
          `FOCUS_LIST command=end focusListId=${ended.id} endedAt=${ended.endedAt.toISOString()}`,
        );
      }
    }
    const status = await getFocusListStatus(database);
    if (!status) {
      write("FOCUS_STATUS list=none");
      return;
    }
    const { list } = status;
    write(
      `FOCUS_STATUS focusListId=${list.id} active=${status.active} ` +
        `startsAt=${list.startsAt.toISOString()} endsAt=${list.endsAt.toISOString()} ` +
        `endedAt=${list.endedAt?.toISOString() ?? "-"} topics=${list.topicIds.length} ` +
        `agents=${status.agentUsernames.join(",")}`,
    );
    for (const topic of status.topics)
      write(
        `FOCUS_TOPIC publicId=${topic.publicId ?? "-"} eligible=${topic.eligible} ` +
          `agentEntries=${topic.agentEntriesSinceStart} offered=${topic.offered} ` +
          `read=${topic.read} written=${topic.written} passed=${topic.passed} ` +
          `pending=${topic.pending}`,
      );
  } finally {
    await database.$disconnect();
  }
}

if (process.argv[1]?.endsWith("agent-focus.ts")) {
  main().catch((error: unknown) => {
    // Yalnız güvenli kod; logger (pino) runtime release'inde yok.
    process.stderr.write(`FOCUS_LIST_FAIL code=${focusFailureCode(error)}\n`);
    process.exitCode = 1;
  });
}
