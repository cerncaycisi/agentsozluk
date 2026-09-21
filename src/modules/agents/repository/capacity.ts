import { Prisma } from "@prisma/client";
import type { RuntimeCapabilityMeasurementInput } from "@/modules/agents/validation/capacity-schemas";
import {
  countConsecutiveCodexFailures,
  type CircuitBreakerConfig,
} from "@/modules/agents/domain/circuit-breaker";
import { runtimeFingerprint } from "@/modules/agents/domain/capacity";
import { ROSTER_HEARTBEAT_FRESH_MS } from "@/modules/agents/domain/stochastic-scheduler";

/**
 * Roster heartbeat'i (`agent_runtime_credential_sync.syncedAt`) taze sayma eşiği.
 * Kuyruk uygunluk sorgusu da aynı eşiği kullanır; ikisi ayrışırsa "çalışabilir
 * kuyruk" ile "worker çevrimiçi" birbirini yalanlar.
 */

/**
 * Run heartbeat'i (`agent_runs.heartbeatAt`) taze sayma eşiği. Worker 10 sn'de
 * bir heartbeat atar (`DEFAULT_RUNTIME_HEARTBEAT_INTERVAL_MS`), yani 120 sn on
 * iki kaçırılmış heartbeat demek — bu sinyal için bol bir pencere.
 *
 * Roster eşiğiyle KASTEN ayrıştı. Roster tick başına yenileniyor (2-5 dk), run
 * heartbeat'i 10 sn'de bir; ikisini aynı sayıya bağlamak rosteri sağlıklı bir
 * worker'da bile bayat gösteriyordu.
 */
const RUN_HEARTBEAT_FRESH_MS = 120_000;

/**
 * Worker'ın görünürlüğü tek bir boolean değildir; üç bağımsız sinyal var:
 * roster sync, run lease/heartbeat ve agent runtime state heartbeat'i. Ekranda
 * hepsini "Worker görünmüyor"a indirmek operatörü yanıltıyordu: roster 120
 * sn'yi aşınca, lease canlı ve run ilerlerken bile runtime ölmüş görünüyordu.
 *
 * - `ONLINE`: roster taze; başka sinyale bakmaya gerek yok.
 * - `ROSTER_STALE_LEASE_ACTIVE`: roster bayat ama en az bir lane'de süresi
 *   dolmamış lease ve taze run heartbeat'i var — iş sürüyor, bayat olan yalnız
 *   roster kanalı. Müdahale gerekmez.
 * - `ROSTER_STALE_NO_LEASE`: roster bayat ve canlı lease yok — worker gerçekten
 *   yok ya da takılmış.
 * - `NEVER_REPORTED`: roster kaydı hiç oluşmamış.
 */
export type WorkerPresence =
  | "ONLINE"
  | "ROSTER_STALE_LEASE_ACTIVE"
  | "ROSTER_STALE_NO_LEASE"
  | "NEVER_REPORTED";

export function deriveWorkerPresence(input: {
  rosterSyncedAt: Date | null;
  now: Date;
  slots: ReadonlyArray<{ leaseRemainingMs: number | null; heartbeatAgeMs: number | null }>;
}): WorkerPresence {
  if (!input.rosterSyncedAt) return "NEVER_REPORTED";
  const rosterAgeMs = input.now.getTime() - input.rosterSyncedAt.getTime();
  if (rosterAgeMs <= ROSTER_HEARTBEAT_FRESH_MS) return "ONLINE";
  const leaseActive = input.slots.some(
    ({ leaseRemainingMs, heartbeatAgeMs }) =>
      leaseRemainingMs !== null &&
      leaseRemainingMs > 0 &&
      heartbeatAgeMs !== null &&
      heartbeatAgeMs <= RUN_HEARTBEAT_FRESH_MS,
  );
  return leaseActive ? "ROSTER_STALE_LEASE_ACTIVE" : "ROSTER_STALE_NO_LEASE";
}

function safeMetadataNumber(metadata: Prisma.JsonValue | null, key: string): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeRuntimePhase(metadata: Prisma.JsonValue): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata.runtimeStatus;
  return typeof value === "string" &&
    ["STARTING", "READING", "THINKING", "VALIDATING", "EXECUTING", "REFLECTING"].includes(value)
    ? value
    : null;
}

export function getLatestRuntimeCapability(transaction: Prisma.TransactionClient) {
  return transaction.agentRuntimeCapability.findFirst({
    orderBy: [{ measuredAt: "desc" }, { id: "desc" }],
  });
}

/**
 * Koşu sağlayıcıya gerçekten çağrı yaptı mı?
 *
 * `codexIntervals` her çağrı için bir kayıt tutuyor — kesilen çağrı dahil
 * (`worker.ts`, `finally` bloğu). Dizi boşsa hiç çağrı yapılmamıştır. Alan
 * hiç yoksa `undefined` dönüyor: eski kayıtlarda eski davranış korunsun.
 */
function runReachedProvider(usageMetadata: unknown): boolean | undefined {
  if (!usageMetadata || typeof usageMetadata !== "object" || Array.isArray(usageMetadata))
    return undefined;
  const intervals = (usageMetadata as Record<string, unknown>).codexIntervals;
  if (!Array.isArray(intervals)) return undefined;
  return intervals.length > 0;
}

export async function getLatestRuntimeFingerprintRecord(transaction: Prisma.TransactionClient) {
  const [run, measurement] = await Promise.all([
    transaction.agentRun.findFirst({
      where: { usageMetadata: { not: Prisma.JsonNull }, finishedAt: { not: null } },
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      select: { usageMetadata: true, finishedAt: true },
    }),
    transaction.agentRuntimeEvent.findFirst({
      where: { eventType: "agent.capacity.measured" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { metadata: true, createdAt: true },
    }),
  ]);
  const fingerprintedRun = runtimeFingerprint(run?.usageMetadata).codexVersion ? run : null;
  if (
    !measurement ||
    (fingerprintedRun?.finishedAt && fingerprintedRun.finishedAt >= measurement.createdAt)
  )
    return fingerprintedRun;
  return { usageMetadata: measurement.metadata, finishedAt: measurement.createdAt };
}

export function createRuntimeCapabilityRecord(
  transaction: Prisma.TransactionClient,
  input: RuntimeCapabilityMeasurementInput & {
    dualConcurrencySupported: boolean;
    measuredAt: Date;
    staleAt: Date;
  },
) {
  return transaction.agentRuntimeCapability.create({
    data: {
      codexVersion: input.codexVersion,
      promptProfileHash: input.promptProfileHash,
      benchmarkRunCount: input.benchmarkRunCount,
      p50DurationMs: input.p50DurationMs,
      p75DurationMs: input.p75DurationMs,
      p95DurationMs: input.p95DurationMs,
      maxDurationMs: input.maxDurationMs,
      singleProcessPeakRssMb: input.singleProcessPeakRssMb,
      dualProcessPeakRssMb: input.dualProcessPeakRssMb,
      dualConcurrencySupported: input.dualConcurrencySupported,
      appLatencyImpact: {
        ...input.appLatencyImpact,
        healthStable: input.healthStable,
        readinessStable: input.readinessStable,
        systemSafety: {
          systemPeakMemoryMb: input.systemPeakMemoryMb,
          swapInMb: input.swapInMb,
          swapOutMb: input.swapOutMb,
          loadAverage1m: input.loadAverage1m,
          oomDetected: input.oomDetected,
          swapThrashingDetected: input.swapThrashingDetected,
        },
        benchmarkOutcomes: {
          successfulActionCount: input.successfulActionCount,
          proposedEntryActionCount: input.proposedEntryActionCount,
          publishedEntries: input.publishedEntries,
          failureRate: input.failureRate,
          duplicateRetryRate: input.duplicateRetryRate,
          dualRunSuccessCount: input.dualRunSuccessCount,
        },
      },
      databaseLatencyImpact: input.databaseLatencyImpact,
      availableMemoryMb: input.availableMemoryMb,
      capacityStatus: input.capacityStatus,
      measuredAt: input.measuredAt,
      staleAt: input.staleAt,
    },
  });
}

/*
  PENCERE FİLTRESİ LATERAL'DEN ÖNCE — 20 Eylül 2026.

  Bu sorgu `cutoff`'u yalnız `clipped_intervals` aşamasında uyguluyordu. Ondan
  önceki iki CTE (`measured_intervals`, `legacy_intervals`) `agent_runs`
  tablosunun TAMAMINI okuyup her satırın `usageMetadata`'sını TOAST'tan çıkarıyor
  ve JSON dizisini açıyordu. Maliyet pencereyle değil **geçmişin toplamıyla**
  büyüyordu: 20 Eylül'de tablo 33.808 satır ve 1,08 GB, %60'ı 30 günden eski.

  Ve bu ucuz bir sorgu değil: `getRuntimeOperationalMetrics` üzerinden
  `leaseRuntimeRun`'ın transaction'ında, üç pencere için (15/60/120 dk) ÜÇ KEZ
  koşuyor.

  19 EYLÜL OLAYIYLA İLİŞKİSİ — NE KANITLANDI, NE KANITLANMADI:
  Kanıtlanan, bu sorgunun maliyetinin pencereyle değil tüm geçmişle büyüdüğü ve
  lease transaction'ının içinde üç kez koştuğu. Kanıtlanmayan, olayın TEK
  mekanizmasının bu olduğu — lease transaction'ında başka iş de var ve gerçek
  süre ölçülmedi. Bu sorgu makul ve somut bir aday; tek sebep olduğu iddiası
  bu koddan çıkarılamaz.

  Olayın büyüklüğü de sınırlarıyla yazılmalı: worker'ın lease alamadığı süre
  için elde **en fazla** 11 sa 00 dk 11 sn var (üst sınır; gerçek kesinti daha
  kısa olabilir, ilk başarısız lease'in ne zaman olduğu bilinmiyor). Entry
  akışındaki boşluk ise 14 sa 27 dk. İkisi ayrı şeyi ölçer;
  `DAGITIM_SONRASI_ONKAYIT_2026-09-17.md` üçüncü eki.

  `4d665cf` timeout'u yükselterek semptomu kapattı.

  Daraltma şu dayanağa oturuyor: aralık damgaları worker sürecinde `new Date()`
  ile yazılıyor (`worker.ts`, çağrının `finally` bloğu), koşunun `finishedAt`'i
  ise çağrılar bittikten sonra kaydediliyor. Yani normal işleyişte hiçbir aralık
  koşunun `finishedAt`'inden sonra bitmez.

  Ama bu bir İNVARYANT DEĞİL, sıralama gözlemi. Saat geriye adım atarsa (NTP
  düzeltmesi) ya da ileride aralıkları `finishedAt`'ten sonra yazan bir yol
  eklenirse ters durum mümkün olur ve keskin bir filtre o aralığı sessizce
  düşürürdü. Bu yüzden filtre `cutoff`'a değil `cutoff - TOLERANS`'a bakıyor
  (Sol'un 20 Eylül bulgusu). Tolerans doğruluğu kaybetmeden alıyor: iki aylık
  tabloda satırların %99'undan fazlası yine elenir, çünkü en dar pencere
  15 dakika ve tolerans 1 saat.

  Henüz bitmemiş koşular (`finishedAt IS NULL`) hiç elenmez; onların aralıkları
  pencerenin içine uzanabilir.

  `agent_runs.finishedAt` üzerinde indeks YOK, yani tarama hâlâ sıralı. Kazanç
  taramadan değil, satırların %99'unda TOAST okuma ve JSON açmanın hiç
  yapılmamasından geliyor. İndeks ayrı bir migration işidir.
*/
/*
  Saat geri adımına ve ileride eklenebilecek "sonradan yazan" yollara karşı pay.
  Tek işi filtreyi keskin olmaktan çıkarmak; pencere hesabını değiştirmez, çünkü
  asıl kırpma `clipped_intervals` aşamasında yapılıyor.
*/
const ARALIK_SAAT_TOLERANSI_MS = 60 * 60_000;

/*
  Sorgu metni ayrı ve DIŞA AÇIK: entegrasyon testi bu sorgunun kendisini
  `EXPLAIN` edip ön filtrenin planda durduğunu doğruluyor. Davranış testleri
  bunu yakalayamaz — filtre kaldırılsa da sonuç aynı çıkar, yalnız maliyet
  büyür (Sol, 21 Eylül). Testin sorgunun KOPYASINI değil kendisini görmesi için
  metin burada tek yerde tutuluyor.
*/
export function busyDurationSorgusu(now: Date, cutoff: Date): Prisma.Sql {
  const filtreSiniri = new Date(cutoff.getTime() - ARALIK_SAAT_TOLERANSI_MS);
  // Merge overlap/adjacency within each run, then sum across runs. Parallel
  // runs consume separate concurrency lanes and must therefore remain additive
  // before division by (window * configured concurrency).
  return Prisma.sql`
    WITH measured_intervals AS (
      SELECT
        run."id" AS "intervalKey",
        (item ->> 'startedAt')::timestamptz AS "startedAt",
        (item ->> 'finishedAt')::timestamptz AS "finishedAt"
      FROM "agent_runs" AS run
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(run."usageMetadata" -> 'codexIntervals') = 'array'
            THEN run."usageMetadata" -> 'codexIntervals'
          ELSE '[]'::jsonb
        END
      ) AS item
      -- Pencere filtresi LATERAL'den ONCE uygulanir; gerekcesi fonksiyonun
      -- ustundeki yorumda.
      WHERE (run."finishedAt" IS NULL OR run."finishedAt" > ${filtreSiniri})
        AND item ->> 'startedAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
        AND item ->> 'finishedAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
    ),
    legacy_intervals AS (
      SELECT
        run."id" AS "intervalKey",
        run."finishedAt" -
          ((run."usageMetadata" ->> 'durationMs')::double precision * interval '1 millisecond')
          AS "startedAt",
        run."finishedAt" AS "finishedAt"
      FROM "agent_runs" AS run
      WHERE run."finishedAt" IS NOT NULL
        AND run."finishedAt" > ${filtreSiniri}
        AND jsonb_typeof(run."usageMetadata") = 'object'
        AND jsonb_typeof(run."usageMetadata" -> 'codexIntervals') IS NULL
        AND run."usageMetadata" ->> 'durationMs' ~ '^\\d+(?:\\.\\d+)?$'
    ),
    active_intervals AS (
      SELECT
        state."currentRunId" AS "intervalKey",
        COALESCE(
          (
            SELECT MIN(event."createdAt")
            FROM "agent_runtime_events" AS event
            WHERE event."runId" = state."currentRunId"
              AND event."eventType" = 'agent.heartbeat'
              AND event."metadata" ->> 'runtimeStatus' IN ('THINKING', 'VALIDATING')
              AND event."createdAt" > COALESCE(
                (
                  SELECT MAX(previous."createdAt")
                  FROM "agent_runtime_events" AS previous
                  WHERE previous."runId" = state."currentRunId"
                    AND previous."eventType" = 'agent.heartbeat'
                    AND previous."metadata" ->> 'runtimeStatus' NOT IN ('THINKING', 'VALIDATING')
                ),
                '-infinity'::timestamptz
              )
          ),
          state."lastHeartbeatAt",
          ${now}
        ) AS "startedAt",
        ${now} AS "finishedAt"
      FROM "agent_runtime_states" AS state
      WHERE state."currentRunId" IS NOT NULL
        AND state."runtimeStatus" IN ('THINKING', 'VALIDATING')
    ),
    codex_intervals AS (
      SELECT * FROM measured_intervals
      UNION ALL
      SELECT * FROM legacy_intervals
      UNION ALL
      SELECT * FROM active_intervals
    ),
    clipped_intervals AS (
      SELECT
        "intervalKey",
        GREATEST("startedAt", ${cutoff}) AS "startedAt",
        LEAST("finishedAt", ${now}) AS "finishedAt"
      FROM codex_intervals
      WHERE "startedAt" < ${now}
        AND "finishedAt" > ${cutoff}
        AND "finishedAt" > "startedAt"
    ),
    interval_frontiers AS (
      SELECT
        "intervalKey",
        "startedAt",
        "finishedAt",
        MAX("finishedAt") OVER (
          PARTITION BY "intervalKey"
          ORDER BY "startedAt", "finishedAt"
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS "previousFinishedAt"
      FROM clipped_intervals
    ),
    interval_groups AS (
      SELECT
        "intervalKey",
        "startedAt",
        "finishedAt",
        SUM(
          CASE
            WHEN "previousFinishedAt" IS NULL OR "startedAt" > "previousFinishedAt" THEN 1
            ELSE 0
          END
        ) OVER (
          PARTITION BY "intervalKey"
          ORDER BY "startedAt", "finishedAt"
        ) AS "intervalGroup"
      FROM interval_frontiers
    ),
    merged_intervals AS (
      SELECT
        "intervalKey",
        MIN("startedAt") AS "startedAt",
        MAX("finishedAt") AS "finishedAt"
      FROM interval_groups
      GROUP BY "intervalKey", "intervalGroup"
    )
    SELECT COALESCE(
      SUM(
        EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000
      ),
      0
    )::double precision AS "busyMs"
    FROM merged_intervals
  `;
}

async function busyDurationMs(
  transaction: Prisma.TransactionClient,
  now: Date,
  cutoff: Date,
): Promise<number> {
  const rows = await transaction.$queryRaw<Array<{ busyMs: number }>>(
    busyDurationSorgusu(now, cutoff),
  );
  return rows[0]?.busyMs ?? 0;
}

async function eligibleQueueMetrics(transaction: Prisma.TransactionClient, now: Date) {
  const rows = await transaction.$queryRaw<Array<{ count: number; oldestAt: Date | null }>>`
    SELECT
      COUNT(*)::int AS "count",
      MIN(GREATEST(run."createdAt", run."availableAt")) AS "oldestAt"
    FROM "agent_runs" AS run
    JOIN "agent_profiles" AS profile
      ON profile."id" = run."agentProfileId"
    LEFT JOIN LATERAL (
      SELECT credential."id", credential."runtimeEnrollmentCipher"
      FROM "agent_credentials" AS credential
      WHERE credential."agentProfileId" = profile."id"
        AND credential."revokedAt" IS NULL
      ORDER BY credential."createdAt" DESC, credential."id" DESC
      LIMIT 1
    ) AS credential ON TRUE
    LEFT JOIN "agent_runtime_credential_sync" AS sync
      ON sync."id" = 'global'
    WHERE run."runStatus" = 'QUEUED'
      AND run."availableAt" <= ${now}
      AND profile."lifecycleStatus" = 'ACTIVE'
      AND profile."currentPersonaVersionId" IS NOT NULL
      AND (
        (
          sync."id" IS NULL
          AND credential."id" IS NOT NULL
          AND credential."runtimeEnrollmentCipher" IS NULL
        )
        OR (
          sync."syncedAt" >= ${new Date(now.getTime() - ROSTER_HEARTBEAT_FRESH_MS)}
          AND credential."id" = ANY(sync."loadedCredentialIds")
        )
      )
  `;
  return rows[0] ?? { count: 0, oldestAt: null };
}

export async function getRuntimeOperationalMetrics(
  transaction: Prisma.TransactionClient,
  input: { now: Date; concurrency: 1 | 2; config: CircuitBreakerConfig },
) {
  const cutoff15m = new Date(input.now.getTime() - 15 * 60_000);
  const cutoff1h = new Date(input.now.getTime() - 60 * 60_000);
  const cutoff2h = new Date(input.now.getTime() - 2 * 60 * 60_000);
  const utilizationWindows = [
    { minutes: 15, cutoff: cutoff15m },
    { minutes: 60, cutoff: cutoff1h },
    { minutes: 120, cutoff: cutoff2h },
    ...(input.config.utilizationWindowMinutes === 15 ||
    input.config.utilizationWindowMinutes === 60 ||
    input.config.utilizationWindowMinutes === 120
      ? []
      : [
          {
            minutes: input.config.utilizationWindowMinutes,
            cutoff: new Date(input.now.getTime() - input.config.utilizationWindowMinutes * 60_000),
          },
        ]),
  ];
  const errorCutoff = new Date(input.now.getTime() - input.config.errorRateWindowMinutes * 60_000);
  const breakerReset = await transaction.agentRuntimeEvent.findFirst({
    where: { eventType: "breaker.reset", createdAt: { lte: input.now } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  });
  const breakerCutoff =
    breakerReset && breakerReset.createdAt > errorCutoff ? breakerReset.createdAt : errorCutoff;
  const [
    terminalRuns,
    latestTerminalRuns,
    recentCandidates,
    queue,
    activeRuns,
    recentExecutions,
    timeoutCount1h,
    workerSync,
    busyWindowEntries,
  ] = await Promise.all([
    transaction.agentRun.findMany({
      where: {
        finishedAt: { gte: breakerCutoff, lte: input.now },
        runStatus: { in: ["SUCCEEDED", "PARTIAL", "FAILED", "TIMED_OUT"] },
      },
      select: { runStatus: true },
    }),
    transaction.agentRun.findMany({
      where: {
        finishedAt: {
          not: null,
          lte: input.now,
          ...(breakerReset ? { gt: breakerReset.createdAt } : {}),
        },
        runStatus: { in: ["SUCCEEDED", "PARTIAL", "FAILED", "TIMED_OUT"] },
      },
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      /*
        Sağlayıcıya ulaşılıp ulaşılmadığını bilmek için `usageMetadata` da
        okunuyor: `codexIntervals` boşsa o koşuda hiç Codex çağrısı yapılmamış
        demektir ve koşu kesici için bilgi taşımaz. Ayrımı hata kodundan tahmin
        etmek yanlış olurdu — `CONTROL_PLANE_ACTION_EXECUTION_FAILED` karardan
        SONRA oluşuyor, yani sağlayıcıya ulaşılmıştır.
      */
      take: input.config.consecutiveCodexFailures,
      select: { runStatus: true, errorCode: true, usageMetadata: true },
    }),
    transaction.agentAction.findMany({
      where: {
        actionType: { in: ["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY", "EDIT_OWN_ENTRY"] },
        ...(breakerReset ? { createdAt: { gt: breakerReset.createdAt } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.config.duplicateWindowSize,
      select: { rejectionCode: true },
    }),
    eligibleQueueMetrics(transaction, input.now),
    transaction.agentRun.findMany({
      where: { runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] } },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        runType: true,
        runStatus: true,
        createdAt: true,
        startedAt: true,
        heartbeatAt: true,
        leaseOwner: true,
        leaseExpiresAt: true,
        agentProfile: {
          select: {
            id: true,
            user: { select: { username: true, displayName: true } },
          },
        },
      },
    }),
    transaction.agentRun.findMany({
      where: {
        finishedAt: { not: null, lte: input.now },
        runStatus: { in: ["SUCCEEDED", "PARTIAL", "FAILED", "TIMED_OUT", "CANCELLED"] },
      },
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        runType: true,
        runStatus: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        leaseOwner: true,
        usageMetadata: true,
        errorCode: true,
        agentProfile: {
          select: {
            id: true,
            user: { select: { username: true, displayName: true } },
          },
        },
      },
    }),
    transaction.agentRun.count({
      where: {
        finishedAt: { gte: cutoff1h, lte: input.now },
        runStatus: "TIMED_OUT",
      },
    }),
    transaction.agentRuntimeCredentialSync.findUnique({
      where: { id: "global" },
      select: {
        workerId: true,
        workerBootId: true,
        processingLanes: true,
        codexVersion: true,
        promptProfileHash: true,
        workerStartedAt: true,
        workerRestartCount: true,
        syncedAt: true,
      },
    }),
    Promise.all(
      utilizationWindows.map(
        async ({ minutes, cutoff }) =>
          [minutes, await busyDurationMs(transaction, input.now, cutoff)] as const,
      ),
    ),
  ]);
  const activePhases = await Promise.all(
    activeRuns.map(async ({ id }) => {
      const heartbeat = await transaction.agentRuntimeEvent.findFirst({
        where: { runId: id, eventType: "agent.heartbeat" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { metadata: true },
      });
      return [id, heartbeat ? safeRuntimePhase(heartbeat.metadata) : null] as const;
    }),
  );
  const phaseByRunId = new Map(activePhases);
  const processingLanes = Math.max(
    1,
    Math.min(2, workerSync?.processingLanes ?? input.concurrency),
  );
  const executionSlots = Array.from({ length: processingLanes }, (_, index) => {
    const run = activeRuns[index] ?? null;
    return {
      slot: index + 1,
      status: run ? ("ACTIVE" as const) : ("IDLE" as const),
      workerId: run?.leaseOwner ?? workerSync?.workerId ?? null,
      runId: run?.id ?? null,
      runType: run?.runType ?? null,
      runStatus: run?.runStatus ?? null,
      agentProfileId: run?.agentProfile.id ?? null,
      username: run?.agentProfile.user.username ?? null,
      displayName: run?.agentProfile.user.displayName ?? null,
      phase: run ? (phaseByRunId.get(run.id) ?? null) : null,
      startedAt: run?.startedAt ?? null,
      heartbeatAt: run?.heartbeatAt ?? null,
      leaseExpiresAt: run?.leaseExpiresAt ?? null,
      leaseAgeMs: run?.startedAt
        ? Math.max(0, input.now.getTime() - run.startedAt.getTime())
        : null,
      heartbeatAgeMs: run?.heartbeatAt
        ? Math.max(0, input.now.getTime() - run.heartbeatAt.getTime())
        : null,
      leaseRemainingMs: run?.leaseExpiresAt
        ? Math.max(0, run.leaseExpiresAt.getTime() - input.now.getTime())
        : null,
    };
  });
  const busyByWindowMinutes = new Map(busyWindowEntries);
  const denominator = (minutes: number) => minutes * 60_000 * input.concurrency;
  const utilization = (minutes: number) =>
    (busyByWindowMinutes.get(minutes) ?? 0) / denominator(minutes);
  return {
    terminalRunsInErrorWindow: terminalRuns.length,
    failedRunsInErrorWindow: terminalRuns.filter(({ runStatus }) =>
      ["FAILED", "TIMED_OUT"].includes(runStatus),
    ).length,
    consecutiveCodexFailures: countConsecutiveCodexFailures(
      latestTerminalRuns.map((run) => {
        const reachedProvider = runReachedProvider(run.usageMetadata);
        return {
          runStatus: run.runStatus,
          errorCode: run.errorCode,
          ...(reachedProvider === undefined ? {} : { reachedProvider }),
        };
      }),
    ),
    duplicateCandidateCount: recentCandidates.length,
    duplicateRejectionCount: recentCandidates.filter(
      ({ rejectionCode }) => rejectionCode === "DUPLICATE_SIMILARITY",
    ).length,
    utilization15m: utilization(15),
    utilization1h: utilization(60),
    utilization2h: utilization(120),
    configuredWindowUtilization: utilization(input.config.utilizationWindowMinutes),
    eligibleQueuedRunCount: queue.count,
    activeRunStartedAts: activeRuns.flatMap(({ startedAt }) => (startedAt ? [startedAt] : [])),
    oldestQueuedAt: queue.oldestAt,
    longestActiveStartedAt: activeRuns[0]?.startedAt ?? null,
    workerPresence: deriveWorkerPresence({
      rosterSyncedAt: workerSync?.syncedAt ?? null,
      now: input.now,
      slots: executionSlots,
    }),
    worker: workerSync
      ? {
          workerId: workerSync.workerId,
          online: input.now.getTime() - workerSync.syncedAt.getTime() <= ROSTER_HEARTBEAT_FRESH_MS,
          bootId: workerSync.workerBootId,
          processingLanes: workerSync.processingLanes,
          codexVersion: workerSync.codexVersion,
          promptProfileHash: workerSync.promptProfileHash,
          startedAt: workerSync.workerStartedAt,
          restartCount: workerSync.workerRestartCount,
          lastSeenAt: workerSync.syncedAt,
          lastSeenAgeMs: Math.max(0, input.now.getTime() - workerSync.syncedAt.getTime()),
        }
      : null,
    executionSlots,
    timeoutCount1h,
    recentExecutions: recentExecutions.map((run) => ({
      runId: run.id,
      runType: run.runType,
      runStatus: run.runStatus,
      workerId: run.leaseOwner,
      agentProfileId: run.agentProfile.id,
      username: run.agentProfile.user.username,
      displayName: run.agentProfile.user.displayName,
      queueWaitMs: run.startedAt
        ? Math.max(0, run.startedAt.getTime() - run.createdAt.getTime())
        : null,
      codexDurationMs: safeMetadataNumber(run.usageMetadata, "durationMs"),
      finishedAt: run.finishedAt,
      errorCode: run.errorCode,
    })),
  };
}
