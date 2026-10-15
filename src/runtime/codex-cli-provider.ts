import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import { chmod, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { AppError } from "@/lib/http/errors";
import type {
  RuntimeProvider,
  RuntimeProviderAttemptDiagnostics,
  RuntimeProviderHostMetrics,
  RuntimeProviderRequest,
  RuntimeProviderResult,
  RuntimeProviderTokenUsage,
} from "@/runtime/provider";
import {
  RuntimeProviderCancelledError,
  RuntimeProviderExecutionError,
  type RuntimeProviderExecutionSafeCode,
  RuntimeProviderTimeoutError,
} from "@/runtime/provider";
import { monitorHostProcess } from "@/runtime/host-metrics";
import { parseRuntimeDecisionOutput } from "@/runtime/output";

interface CodexCliProviderOptions {
  executable: string;
  sandboxExecutable: string;
  credentialFile: string;
  runtimeHome: string;
  workRoot: string;
  /** Model profili; verilmezse `luna-max` (üretimin kanıtlanmış varsayılanı). */
  codexProfile?: AgentRuntimeCodexProfileName;
  spawnProcess?: typeof spawn;
}

export const AGENT_RUNTIME_CODEX_MODEL = "gpt-5.6-luna";
export const AGENT_RUNTIME_CODEX_REASONING_EFFORT = "max" as const;

/*
  Model profilleri (14 Ekim 2026, Gökhan: "bu modeli medium ve lowda testleyelim"; yerel A/B
  YEREL_KANIT "Sonuç — gpt-6.1-sol düşük çaba"). Yalnız bu kapalı listeden seçilir; serbest model
  adı kabul edilmez. Geri dönüş: profili `luna-max` yapıp worker'ı yeniden başlatmak.
*/
export const AGENT_RUNTIME_CODEX_PROFILES = {
  "luna-max": {
    model: AGENT_RUNTIME_CODEX_MODEL,
    reasoningEffort: AGENT_RUNTIME_CODEX_REASONING_EFFORT,
  },
  "sol-medium": { model: "gpt-6.1-sol", reasoningEffort: "medium" },
} as const;
export type AgentRuntimeCodexProfileName = keyof typeof AGENT_RUNTIME_CODEX_PROFILES;
export const agentRuntimeCodexProfileNames = Object.keys(AGENT_RUNTIME_CODEX_PROFILES) as [
  AgentRuntimeCodexProfileName,
  ...AgentRuntimeCodexProfileName[],
];
type AgentRuntimeCodexReasoningEffort =
  (typeof AGENT_RUNTIME_CODEX_PROFILES)[AgentRuntimeCodexProfileName]["reasoningEffort"];

/*
  Araç kapatma sözleşmesi (15 Ekim). Ajan kararı yalnız son mesajdan okunur; modelin bir araca
  ihtiyacı yok. 15 Ekim ölçümü (üretim host'u, üretim sandbox argümanları, gpt-5.6-luna max):
  yalnız `shell_tool=false` ile CLI 0.144.6 modele `functions.exec` (dosya erişimi olmayan JS), web
  araması, hesaba bağlı uygulama/MCP araçları ve alt ajan başlatma sundu; model bunları çağırdı.
  CLI 0.160.0 aynı araçları kod modu üzerinden sunuyor; ölçümde kod modu yardımcı ikilisi
  sandbox'ta olmadığı için çağrılar yürütülemedi.

  Üç katman (Astra 1. tur, 15 Ekim):
  1. Aşağıdaki özellikler global `-c` bayraklarıyla kapatılır; web araması ayrıca kapatılır.
  2. Her çağrıdan önce `features list` aynı bayraklarla okunur. Zorunlu özellik listede yoksa ya da
     açıksa çağrı yapılmaz: CLI bilinmeyen `-c` anahtarını sessizce yok saydığı için yazım hatası
     ya da kaldırılmış bir ad ancak böyle yakalanır. İsteğe bağlı özellikler CLI 0.144.6'da yok;
     varsa kapalı olmaları gerekir.
  3. Çağrı sırasında dış etkili bir araç öğesi görülürse koşu `CODEX_TOOL_ITEM` ile düşer.

  `unified_exec` listede değil: CLI 0.160.0'da `-c` ile kapanmıyor (shell aracının iç
  uygulaması). Shell aracının kendisi `shell_tool=false` ile kapalı; ölçümde modelin araç
  listesinde shell/komut aracı yoktu.

  Bkz docs/CODEX_CREDENTIAL_EXPOSURE_2026-08-31.md.
*/
export const CODEX_TOOL_FEATURES_REQUIRED = [
  /*
    31 Ağustos ölçümü: shell aracı açıkken prompt injection (rol değiştirme) ile model sandbox'ta
    görünür auth.json'ı okuyup çıktıya taşıyordu, 8'de 1. Araç kapalıyken 0/8.
  */
  "shell_tool",
  "apps",
  "multi_agent",
  "image_generation",
  "goals",
  "plugins",
  "remote_plugin",
  "tool_suggest",
  "code_mode_host",
] as const;
export const CODEX_TOOL_FEATURES_OPTIONAL = ["view_image", "skill_search", "sleep_tool"] as const;
export const CODEX_TOOL_DISABLE_ARGUMENTS = [
  ...[...CODEX_TOOL_FEATURES_REQUIRED, ...CODEX_TOOL_FEATURES_OPTIONAL].map(
    (feature) => `features.${feature}=false`,
  ),
  'web_search="disabled"',
].flatMap((setting) => ["-c", setting]);

/**
 * `codex features list` çıktısı kapatma sözleşmesini sağlıyor mu. Sözleşmedeki bir özelliğin adı
 * satırda geçiyor ama satır beklenen biçimde değilse sonuç ret olur (Astra 2. tur); yalnız gerçekten
 * listede olmayan isteğe bağlı özellik yok sayılır.
 */
export function codexToolFeaturesDisabled(featureList: string): boolean {
  const contract = new Set<string>([
    ...CODEX_TOOL_FEATURES_REQUIRED,
    ...CODEX_TOOL_FEATURES_OPTIONAL,
  ]);
  const enabled = new Map<string, boolean>();
  for (const rawLine of featureList.split("\n")) {
    const line = rawLine.trim();
    const name = line.split(/\s+/u, 1)[0] ?? "";
    if (!contract.has(name)) continue;
    const match = line.match(/^([a-z0-9_]+)\s+[a-z][a-z ]*?\s+(true|false)$/u);
    if (!match || enabled.has(name)) return false;
    enabled.set(name, match[2] === "true");
  }
  return (
    CODEX_TOOL_FEATURES_REQUIRED.every((feature) => enabled.get(feature) === false) &&
    CODEX_TOOL_FEATURES_OPTIONAL.every((feature) => enabled.get(feature) !== true)
  );
}

/*
  Alt ajan: `multi_agent=false` alt ajan araçlarını kapatmıyor (15 Ekim ölçümü). CLI 0.160.0'da
  `agents.max_concurrent_threads_per_session=1` alt ajan başlatmayı engelledi; 0.144.6 bu anahtarı
  yapılandırma hatasıyla reddediyor. Bu yüzden ayar sürüme bağlı verilir: tanınmayan ya da
  `0.160.0`'dan eski sürüme gönderilmez.
*/
const CODEX_THREAD_LIMIT_MINIMUM_VERSION = [0, 160, 0] as const;
export const CODEX_THREAD_LIMIT_ARGUMENTS = ["-c", "agents.max_concurrent_threads_per_session=1"];

export function codexSupportsThreadLimit(version: string): boolean {
  const match = version.match(/(?:^|\s)(\d+)\.(\d+)\.(\d+)(?:\s|$|-)/u);
  if (!match) return false;
  const parsed = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let index = 0; index < 3; index += 1) {
    if (parsed[index]! !== CODEX_THREAD_LIMIT_MINIMUM_VERSION[index])
      return parsed[index]! > CODEX_THREAD_LIMIT_MINIMUM_VERSION[index]!;
  }
  return true;
}

/*
  `codex exec --json` öğe türleri. Dış etkili araç öğesi koşuyu düşürür; bilinmeyen tür yalnız
  sayılır, çünkü yeni bir CLI'nın zararsız bir türü bütün koşuları düşürmemeli. CLI geçişini
  izleme betiği korur.
*/
const CODEX_BENIGN_ITEM_TYPES = new Set(["agent_message", "reasoning", "todo_list"]);
const CODEX_TOOL_ITEM_TYPES = new Set([
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "collab_tool_call",
  "web_search",
  "image_generation",
]);
const MAX_TRACKED_TOOL_ITEMS = 1_000;

export interface CodexItemCounts {
  errorItems: number;
  toolItems: number;
  unknownItems: number;
}

/**
 * Bir olay satırını sınıflar. Yalnız `item.started` ve `item.completed` satırları ayrıştırılır;
 * öğenin türü ve kimliği dışında hiçbir alan okunmaz ve tutulmaz.
 */
export function classifyCodexItemEvent(
  line: string,
): { kind: "error" | "tool" | "unknown" | "benign"; id?: string; completed: boolean } | undefined {
  if (!line.includes('"item.completed"') && !line.includes('"item.started"')) return undefined;
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!event || typeof event !== "object") return undefined;
  const { type, item } = event as { type?: unknown; item?: unknown };
  if ((type !== "item.completed" && type !== "item.started") || !item || typeof item !== "object")
    return undefined;
  const { type: itemType, id } = item as { type?: unknown; id?: unknown };
  const safeId = typeof id === "string" && id.length <= 200 ? id : undefined;
  const completed = type === "item.completed";
  if (typeof itemType !== "string") return { kind: "unknown", completed };
  const kind = CODEX_TOOL_ITEM_TYPES.has(itemType)
    ? "tool"
    : itemType === "error"
      ? "error"
      : CODEX_BENIGN_ITEM_TYPES.has(itemType)
        ? "benign"
        : "unknown";
  return { kind, ...(safeId ? { id: safeId } : {}), completed };
}

export const RETAINED_RUNTIME_WORK_FILES = ["output.json", "output.schema.json"] as const;
const maximumActiveRunAndCleanupGraceMs = 25 * 60 * 1000;
const runtimeWorkExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function validateDebugRetentionHours(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 24)
    throw new Error("Runtime debug retention 0–24 saat aralığında olmalıdır.");
  return value;
}

function safeEnvironment(runtimeHome: string, workDirectory: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: runtimeHome,
    CODEX_HOME: runtimeHome,
    TMPDIR: workDirectory,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NO_COLOR: "1",
  };
}

function assertAbsoluteSandboxPath(label: string, value: string): void {
  if (!path.isAbsolute(value) || path.normalize(value) !== value)
    throw new Error(`${label} mutlak ve normalize bir yol olmalıdır.`);
}

/**
 * Sembolik bağı çözer; yol henüz yoksa sözlüksel hâline döner.
 *
 * `realpathSync` var olmayan yolda fırlatıyor ve work dizini bu kontrolden
 * ÖNCE yaratılmamış olabilir. Fırlatmak yerine sözlüksel yola dönmek, en kötü
 * hâlde bugünkü davranışı korur; var olan yollarda ise gerçek hedefi kullanır.
 */
function resolveRealPath(value: string): string {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

/**
 * Kapsama kontrolü sembolik bağ çözülerek yapılır.
 *
 * Sözlüksel karşılaştırma tek başına aldatılabilir: work root içinde duran ama
 * dışarıyı gösteren bir sembolik bağ, `path.relative` açısından "içeride"
 * görünür ve sandbox'a beklenmedik bir dizin bind edilirdi. Bu dizinleri
 * operatör kuruyor, yani saldırgan kontrolünde değil — bu yüzden savunma
 * derinliği, birincil kapı değil (Sol hakem turu).
 */
function containsPath(parent: string, candidate: string): boolean {
  const relative = path.relative(resolveRealPath(parent), resolveRealPath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sandboxedCodexCommand(
  options: CodexCliProviderOptions,
  codexArguments: string[],
  workDirectory: string,
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const credentialDirectory = path.dirname(options.credentialFile);
  for (const [label, value] of [
    ["Codex executable", options.executable],
    ["Codex sandbox executable", options.sandboxExecutable],
    ["Runtime credential file", options.credentialFile],
    ["Runtime Codex home", options.runtimeHome],
    ["Runtime work root", options.workRoot],
    ["Runtime work directory", workDirectory],
  ] as const)
    assertAbsoluteSandboxPath(label, value);
  if (credentialDirectory === path.parse(credentialDirectory).root)
    throw new Error("Runtime credential dizini kök dizin olamaz.");
  if (
    containsPath(credentialDirectory, options.runtimeHome) ||
    containsPath(options.runtimeHome, credentialDirectory) ||
    containsPath(credentialDirectory, options.workRoot) ||
    containsPath(options.workRoot, credentialDirectory)
  )
    throw new Error("Runtime credential dizini Codex home veya work root ile örtüşemez.");
  if (!containsPath(options.workRoot, workDirectory))
    throw new Error("Codex work directory runtime work root dışında olamaz.");

  const env = safeEnvironment(options.runtimeHome, workDirectory);
  const environmentArguments = Object.entries(env).flatMap(([key, value]) =>
    value === undefined ? [] : ["--setenv", key, value],
  );
  return {
    command: options.sandboxExecutable,
    args: [
      "--die-with-parent",
      "--new-session",
      "--unshare-user",
      "--unshare-pid",
      "--unshare-ipc",
      "--unshare-uts",
      "--clearenv",
      ...environmentArguments,
      /*
        Host geneli okuma KAPALI. Eskiden `--ro-bind / /` vardı: sandbox içindeki
        model aracı `/etc`, `/home` ve host'un bütün sırlarını okuyabiliyordu
        (31 Ağustos ölçümü: `/etc/passwd` okunabilir çıktı). Asıl açık —
        modelin dosya aracı — `features.shell_tool=false` ile kapatıldı; bu
        allowlist savunma derinliği: araç bir gün geri gelse bile okunacak bir
        şey olmasın.

        Liste tahminle değil ÖLÇÜMLE kuruldu (2 Eylül 2026, üretim host'u,
        gerçek bwrap, gerçek Codex çağrısı):
        - codex statik derlenmiş; `/lib`, `/lib64`, `/bin`, `/usr/bin` GEREKSİZ.
        - `/etc/ssl` olmadan TLS kırılıyor (`error sending request`).
        - `/etc/resolv.conf` + `/etc/hosts` olmadan DNS kırılıyor
          (`failed to lookup address information`).
        - Dördüyle birlikte çağrı `api.openai.com`'a ulaşıp 401 dönüyor, yani
          ağ/TLS/DNS tam çalışıyor.

        Yanlış bir liste Codex'i hiç çalıştırmaz; `inspect()` başlangıçta
        sandbox içinden `codex --version` koştuğu için hata sessiz kalmaz.
      */
      "--ro-bind",
      options.executable,
      options.executable,
      "--ro-bind",
      "/etc/ssl",
      "/etc/ssl",
      "--ro-bind",
      "/etc/resolv.conf",
      "/etc/resolv.conf",
      "--ro-bind",
      "/etc/hosts",
      "/etc/hosts",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--tmpfs",
      credentialDirectory,
      "--bind",
      options.runtimeHome,
      options.runtimeHome,
      "--bind",
      workDirectory,
      workDirectory,
      "--chdir",
      workDirectory,
      "--",
      options.executable,
      ...codexArguments,
    ],
    env,
  };
}

export async function cleanupExpiredRuntimeWork(
  workRoot: string,
  retainWorkHours: number,
  nowMs = Date.now(),
): Promise<void> {
  validateDebugRetentionHours(retainWorkHours);
  const cutoff =
    nowMs -
    (retainWorkHours === 0 ? maximumActiveRunAndCleanupGraceMs : retainWorkHours * 60 * 60 * 1000);
  for (const entry of await readdir(workRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(workRoot, entry.name);
    if ((await stat(target)).mtimeMs < cutoff) await rm(target, { recursive: true, force: true });
  }
}

export async function finalizeRuntimeWorkDirectory(
  workDirectory: string,
  retainWorkHours: number,
): Promise<void> {
  validateDebugRetentionHours(retainWorkHours);
  if (retainWorkHours === 0) {
    await rm(workDirectory, { recursive: true, force: true });
    return;
  }
  const allowed = new Set<string>(RETAINED_RUNTIME_WORK_FILES);
  for (const entry of await readdir(workDirectory, { withFileTypes: true })) {
    const target = path.join(workDirectory, entry.name);
    if (!allowed.has(entry.name) || !entry.isFile() || !(await lstat(target)).isFile()) {
      await rm(target, { recursive: true, force: true });
      continue;
    }
    await chmod(target, 0o600);
  }
}

export function scheduleRuntimeWorkDirectoryExpiry(
  workDirectory: string,
  retainWorkHours: number,
): void {
  validateDebugRetentionHours(retainWorkHours);
  cancelRuntimeWorkDirectoryExpiry(workDirectory);
  if (retainWorkHours === 0) return;
  const timer = setTimeout(
    () => {
      if (runtimeWorkExpiryTimers.get(workDirectory) !== timer) return;
      runtimeWorkExpiryTimers.delete(workDirectory);
      void rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
    },
    retainWorkHours * 60 * 60 * 1000,
  );
  runtimeWorkExpiryTimers.set(workDirectory, timer);
  timer.unref();
}

export function cancelRuntimeWorkDirectoryExpiry(workDirectory: string): void {
  const timer = runtimeWorkExpiryTimers.get(workDirectory);
  if (!timer) return;
  clearTimeout(timer);
  runtimeWorkExpiryTimers.delete(workDirectory);
}

/** Tek satırlık sayısal sınır: bozuk ya da aşırı büyük olay sayı sayılmaz. */
const MAX_TOKEN_COUNT = 1_000_000_000;
/** Bölünmemiş tek olay satırının tutulacağı üst sınır; aşan içerik satırı atılır. */
const MAX_PENDING_EVENT_CHARS = 1_048_576;

/**
 * `codex exec --json` satırından yalnız `turn.completed.usage` sayılarını çıkarır. İçerik
 * taşıyan olaylar (`item.*`) JSON olarak bile ayrıştırılmaz; böylece model metni bellekte
 * gereğinden uzun tutulmaz ve hiçbir yere yazılmaz.
 */
export function parseCodexTurnUsage(line: string): RuntimeProviderTokenUsage | undefined {
  if (!line.includes('"turn.completed"')) return undefined;
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!event || typeof event !== "object") return undefined;
  const { type, usage } = event as { type?: unknown; usage?: unknown };
  if (type !== "turn.completed" || !usage || typeof usage !== "object") return undefined;
  const raw = usage as Record<string, unknown>;
  /*
    Eksik ya da `null` sayaç sıfır sayılmaz (Astra, 10 Ekim): bilinmeyen kullanım ölçülmüş sıfır
    gibi saklanırsa maliyet yanlışlaşır. Girdi ve çıktı zorunlu; önbellek ve düşünme sayaçları
    yalnız geçerli tamsayı olarak geldiyse yazılır. Geçersiz bir değer bütün ölçümü düşürür.
  */
  const valid = (value: unknown): value is number =>
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TOKEN_COUNT;
  const optional = (key: string): number | undefined | null => {
    if (!(key in raw) || raw[key] === null) return undefined;
    return valid(raw[key]) ? raw[key] : null;
  };
  if (!valid(raw.input_tokens) || !valid(raw.output_tokens)) return undefined;
  const cachedInputTokens = optional("cached_input_tokens");
  const reasoningOutputTokens = optional("reasoning_output_tokens");
  if (cachedInputTokens === null || reasoningOutputTokens === null) return undefined;
  return {
    inputTokens: raw.input_tokens,
    outputTokens: raw.output_tokens,
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(reasoningOutputTokens === undefined ? {} : { reasoningOutputTokens }),
  };
}

function collect(
  child: ChildProcessWithoutNullStreams,
  input: string,
  timeoutMs: number,
  signal?: AbortSignal,
  terminateProcessGroup = false,
  parseJsonEvents = false,
): Promise<{
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  tokenUsage?: RuntimeProviderTokenUsage;
  itemCounts?: CodexItemCounts;
  eventStreamOverflow: boolean;
}> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let pendingEvent = "";
    let tokenUsage: RuntimeProviderTokenUsage | undefined;
    const itemCounts: CodexItemCounts = { errorItems: 0, toolItems: 0, unknownItems: 0 };
    const seenToolItems = new Set<string>();
    let toolSeen = false;
    let eventStreamOverflow = false;
    const stdoutDecoder = new StringDecoder("utf8");
    const readEvent = (line: string) => {
      tokenUsage = parseCodexTurnUsage(line) ?? tokenUsage;
      const item = classifyCodexItemEvent(line);
      if (!item) return;
      if (item.kind === "tool") {
        // Güvenlik kararı sayıdan bağımsız: tek bir araç olayı (başlangıç ya da bitiş) yeter.
        toolSeen = true;
        // Sayı telemetridir: aynı kimlikli `started`/`completed` bir kez; kimliksiz yalnız bitiş.
        if (item.id) {
          if (seenToolItems.has(item.id)) return;
          if (seenToolItems.size >= MAX_TRACKED_TOOL_ITEMS) return;
          seenToolItems.add(item.id);
        } else if (!item.completed) return;
        itemCounts.toolItems += 1;
      } else if (item.completed && item.kind === "error") itemCounts.errorItems += 1;
      else if (item.completed && item.kind === "unknown") itemCounts.unknownItems += 1;
    };
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    const signalTree = (signalName: NodeJS.Signals) => {
      if (terminateProcessGroup && child.pid) {
        try {
          process.kill(-child.pid, signalName);
          return;
        } catch {
          // The group may already have exited; direct PID signaling is the safe fallback.
        }
      }
      child.kill(signalName);
    };
    const terminate = () => {
      signalTree("SIGTERM");
      setTimeout(() => {
        if (!settled) signalTree("SIGKILL");
      }, 5000).unref();
    };
    const onAbort = () => {
      cancelled = true;
      terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString("utf8").slice(0, 16_384 - stderr.length);
    });
    /*
      Olay akışı yalnız `--json` ile çalışan çağrıda ayrıştırılır (Astra, 10 Ekim): `--json`
      yoksa stdout model metni taşıyabilir ve o metindeki sayılar ölçüm sayılmamalı.
    */
    if (!parseJsonEvents) child.stdout.resume();
    else
      child.stdout.on("data", (chunk: Buffer) => {
        // Çok baytlı karakter parça sınırında bölünebilir; uzunluk parçalanmadan bağımsız olmalı.
        pendingEvent += stdoutDecoder.write(chunk);
        let newline = pendingEvent.indexOf("\n");
        while (newline >= 0) {
          // Satır sınırı parçalanmadan bağımsız (Sol 6.1 1. tur): uzun tam satır da okunmaz.
          if (newline > MAX_PENDING_EVENT_CHARS) eventStreamOverflow = true;
          else readEvent(pendingEvent.slice(0, newline));
          pendingEvent = pendingEvent.slice(newline + 1);
          newline = pendingEvent.indexOf("\n");
        }
        /*
          Sınırı aşan satır okunamaz; okunamayan olay "araç yok" sayılmaz (Astra 2. tur). Satır
          atılır ve çağrı `CODEX_EVENT_STREAM_INVALID` ile düşer.
        */
        if (pendingEvent.length > MAX_PENDING_EVENT_CHARS) {
          pendingEvent = "";
          eventStreamOverflow = true;
        }
      });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (exitCode, exitSignal) =>
      finish(() => {
        if (parseJsonEvents) {
          pendingEvent += stdoutDecoder.end();
          if (pendingEvent.length > MAX_PENDING_EVENT_CHARS) eventStreamOverflow = true;
          else readEvent(pendingEvent);
        }
        pendingEvent = "";
        resolve({
          exitCode,
          exitSignal,
          stderr,
          timedOut,
          cancelled,
          ...(tokenUsage ? { tokenUsage } : {}),
          ...(parseJsonEvents
            ? {
                itemCounts: {
                  ...itemCounts,
                  toolItems: Math.max(itemCounts.toolItems, toolSeen ? 1 : 0),
                },
              }
            : {}),
          eventStreamOverflow,
        });
      }),
    );
    child.stdin.end(input);
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    timeout.unref();
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function safeCodexFailure(
  stderr: string,
  exitSignal: NodeJS.Signals | null = null,
): RuntimeProviderExecutionSafeCode {
  if (exitSignal !== null) return "CODEX_PROCESS_SIGNALLED";
  if (/unexpected argument|unknown option|unrecognized option/iu.test(stderr))
    return "CODEX_ARGUMENT_UNSUPPORTED";
  if (/not logged in|login required|authentication required|unauthorized/iu.test(stderr))
    return "CODEX_AUTH_REQUIRED";
  if (/schema.{0,160}(invalid|unsupported)|invalid.{0,160}schema/iu.test(stderr)) {
    const missingProperty = stderr.match(/Missing ['"]([A-Za-z0-9_]{1,64})['"]/iu)?.[1];
    if (missingProperty) return "CODEX_SCHEMA_MISSING_REQUIRED";
    if (/additionalProperties/iu.test(stderr)) return "CODEX_SCHEMA_ADDITIONAL_PROPERTIES";
    if (/format.{0,80}(unsupported|invalid)/iu.test(stderr))
      return "CODEX_SCHEMA_FORMAT_UNSUPPORTED";
    return "CODEX_SCHEMA_UNSUPPORTED";
  }
  if (/rate limit|usage limit|quota exceeded|too many requests/iu.test(stderr))
    return "CODEX_RATE_LIMITED";
  if (/stream disconnected|error sending request|connection (failed|refused|closed)/iu.test(stderr))
    return "CODEX_UPSTREAM_UNAVAILABLE";
  if (stderr.length === 0) return "CODEX_EXEC_FAILED_NO_STDERR";
  return "CODEX_EXEC_FAILED";
}

export function sanitizeRetainedRuntimeOutput(output: unknown): Record<string, unknown> {
  const parsed = parseRuntimeDecisionOutput(output, { allowExtendedCompatibility: true });
  if (!parsed.success) return { candidateActions: [], errorCode: "CODEX_OUTPUT_SCHEMA_INVALID" };
  return {
    candidateActions: parsed.data.actions,
    safeRunSummary: parsed.data.safeRunSummary,
  };
}

async function persistSafeRetainedRuntimeOutput(
  outputPath: string,
  output: unknown,
  errorCode: string,
): Promise<void> {
  const artifact =
    output === undefined
      ? { candidateActions: [], errorCode }
      : sanitizeRetainedRuntimeOutput(output);
  try {
    await writeFile(outputPath, JSON.stringify(artifact), { mode: 0o600, flag: "w" });
    await chmod(outputPath, 0o600);
  } catch {
    // Never retain the raw Codex file when the safe rewrite fails.
    await rm(outputPath, { force: true });
  }
}

export class CodexCliProvider implements RuntimeProvider {
  readonly #options: CodexCliProviderOptions;
  readonly #profile: (typeof AGENT_RUNTIME_CODEX_PROFILES)[AgentRuntimeCodexProfileName];

  constructor(options: CodexCliProviderOptions) {
    this.#options = options;
    this.#profile = AGENT_RUNTIME_CODEX_PROFILES[options.codexProfile ?? "luna-max"];
  }

  async #inspectCommand(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
    await Promise.all([
      mkdir(this.#options.runtimeHome, { recursive: true, mode: 0o700 }),
      mkdir(this.#options.workRoot, { recursive: true, mode: 0o700 }),
    ]);
    const sandboxed = sandboxedCodexCommand(this.#options, args, this.#options.workRoot);
    const child = (this.#options.spawnProcess ?? spawn)(sandboxed.command, sandboxed.args, {
      cwd: this.#options.workRoot,
      shell: false,
      detached: true,
      env: sandboxed.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    const result = await collect(
      child,
      "",
      timeoutMs,
      signal,
      this.#options.spawnProcess === undefined,
    );
    if (result.cancelled) throw new RuntimeProviderCancelledError();
    if (result.timedOut) throw new RuntimeProviderTimeoutError();
    if (result.exitCode !== 0) throw new AppError("INTERNAL_ERROR", 500, "Codex CLI incelenemedi.");
    return stdout.trim();
  }

  async #inspectWithin(
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{
    version: string;
    supportsStructuredOutput: boolean;
    supportsJsonEvents: boolean;
    model: string;
    reasoningEffort: AgentRuntimeCodexReasoningEffort;
  }> {
    const [version, topLevelHelp, execHelp, featureList] = await Promise.all([
      this.#inspectCommand(["--version"], timeoutMs, signal),
      this.#inspectCommand(["--help"], timeoutMs, signal),
      this.#inspectCommand(["exec", "--help"], timeoutMs, signal),
      this.#inspectCommand(
        [...CODEX_TOOL_DISABLE_ARGUMENTS, "features", "list"],
        timeoutMs,
        signal,
      ),
    ]);
    if (topLevelHelp.length === 0)
      throw new AppError("INTERNAL_ERROR", 500, "Codex CLI yardım çıktısı incelenemedi.");
    if (!codexToolFeaturesDisabled(featureList))
      throw new AppError("INTERNAL_ERROR", 500, "Codex CLI araç kapatma sözleşmesi doğrulanamadı.");
    /*
      `features list` CODEX_HOME/config.toml'u okur, karar çağrısı ise `--ignore-user-config` ile
      okumaz. Dosya varsa doğrulanan yapılandırma çalışanla aynı olmayabilir; çağrı yapılmaz.
      15 Ekim'de üretimde bu dosya yok.
    */
    if (fs.existsSync(path.join(this.#options.runtimeHome, "config.toml")))
      throw new AppError("INTERNAL_ERROR", 500, "Codex home içinde config.toml beklenmiyor.");
    return {
      version,
      model: this.#profile.model,
      reasoningEffort: this.#profile.reasoningEffort,
      supportsStructuredOutput:
        execHelp.includes("--output-schema") && execHelp.includes("--output-last-message"),
      // Token telemetrisi (Y6) yalnız olay akışını destekleyen CLI'da açılır.
      supportsJsonEvents: /(^|\s)--json(\s|$)/mu.test(execHelp),
    };
  }

  async inspect(): Promise<{
    version: string;
    supportsStructuredOutput: boolean;
    supportsJsonEvents: boolean;
    model: string;
    reasoningEffort: AgentRuntimeCodexReasoningEffort;
  }> {
    await mkdir(this.#options.workRoot, { recursive: true, mode: 0o700 });
    // A worker restart must also sweep leftovers; otherwise the final retained run
    // could outlive the hard twenty-four-hour debug ceiling indefinitely.
    await cleanupExpiredRuntimeWork(this.#options.workRoot, 24);
    return this.#inspectWithin(10_000);
  }

  async invoke(request: RuntimeProviderRequest): Promise<RuntimeProviderResult> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        request.runId,
      )
    )
      throw new AppError("VALIDATION_ERROR", 422, "Runtime run kimliği geçersizdir.");
    const startedAt = Date.now();
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)
      throw new RuntimeProviderTimeoutError();
    const deadlineAtMs = startedAt + request.timeoutMs;
    /*
      Süre tek parça değil: kurulum (dizin + şema + üç CLI denetimi), modelin
      kendi payı ve temizlik ayrı ayrı ölçülüyor. Ölçüm ayrıştırılmadan
      "çağrı 352 sn sürdü" cümlesi modelin 352 sn düşündüğü anlamına
      geliyormuş gibi okunuyordu; okunmamalı.
    */
    let inspectMs = 0;
    let setupMs = 0;
    let modelStartedAtMs = 0;
    let hostMetrics: RuntimeProviderHostMetrics | undefined;
    let tokenUsage: RuntimeProviderTokenUsage | undefined;
    let itemCounts: CodexItemCounts | undefined;
    const diagnostics = (): RuntimeProviderAttemptDiagnostics => ({
      setupMs,
      inspectMs,
      modelMs: modelStartedAtMs === 0 ? 0 : Math.max(0, Date.now() - modelStartedAtMs),
      ...(hostMetrics ? { hostMetrics } : {}),
      ...(tokenUsage ? { tokenUsage } : {}),
      ...(itemCounts ? { itemCounts } : {}),
    });
    const remainingMs = (): number => {
      if (request.signal?.aborted) throw new RuntimeProviderCancelledError(diagnostics());
      const remaining = Math.ceil(deadlineAtMs - Date.now());
      if (remaining <= 0) throw new RuntimeProviderTimeoutError(diagnostics());
      return remaining;
    };
    const debugRetentionHours = validateDebugRetentionHours(request.debugRetentionHours ?? 0);
    const workDirectory = path.join(this.#options.workRoot, request.runId);
    const schemaPath = path.join(workDirectory, "output.schema.json");
    const outputPath = path.join(workDirectory, "output.json");
    let retainedOutput: unknown;
    let retainedErrorCode = "CODEX_RUN_INCOMPLETE";
    await Promise.all([
      mkdir(this.#options.runtimeHome, { recursive: true, mode: 0o700 }),
      mkdir(this.#options.workRoot, { recursive: true, mode: 0o700 }),
    ]);
    await cleanupExpiredRuntimeWork(this.#options.workRoot, debugRetentionHours);
    cancelRuntimeWorkDirectoryExpiry(workDirectory);
    await rm(workDirectory, { recursive: true, force: true });
    await mkdir(workDirectory, { recursive: false, mode: 0o700 });
    try {
      await writeFile(schemaPath, JSON.stringify(request.outputSchema), {
        mode: 0o600,
        flag: "wx",
      });
      await chmod(schemaPath, 0o600);
      const inspectStartedAtMs = Date.now();
      const inspected = await this.#inspectWithin(remainingMs(), request.signal);
      inspectMs = Date.now() - inspectStartedAtMs;
      if (!inspected.supportsStructuredOutput) {
        throw new AppError("INTERNAL_ERROR", 500, "Codex CLI structured output desteklemiyor.");
      }
      // Araç denetimi olay akışına dayanır; olay akışı olmayan CLI ile çağrı yapılmaz (Astra 2. tur).
      if (!inspected.supportsJsonEvents) {
        throw new AppError("INTERNAL_ERROR", 500, "Codex CLI olay akışı (--json) desteklemiyor.");
      }
      const args = [
        "--ask-for-approval",
        "never",
        "--model",
        this.#profile.model,
        "-c",
        `model_reasoning_effort="${this.#profile.reasoningEffort}"`,
        // Araç kapatma sözleşmesi; `exec`'ten önce, global konumda.
        ...CODEX_TOOL_DISABLE_ARGUMENTS,
        ...(codexSupportsThreadLimit(inspected.version) ? CODEX_THREAD_LIMIT_ARGUMENTS : []),
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        // Olay akışı token sayıları ve araç denetimi için okunur; karar çıktısı dosyadan gelir.
        "--json",
        "--sandbox",
        "read-only",
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        "-",
      ];
      const sandboxed = sandboxedCodexCommand(this.#options, args, workDirectory);
      const child = (this.#options.spawnProcess ?? spawn)(sandboxed.command, sandboxed.args, {
        cwd: workDirectory,
        shell: false,
        detached: true,
        env: sandboxed.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const monitor = monitorHostProcess(child.pid);
      setupMs = Date.now() - startedAt;
      modelStartedAtMs = Date.now();
      const result = await collect(
        child,
        request.prompt,
        remainingMs(),
        request.signal,
        this.#options.spawnProcess === undefined,
        true,
      );
      tokenUsage = result.tokenUsage;
      itemCounts = result.itemCounts;
      /*
        Host metriği hata yolunda da taşınmalı. Eskiden burada toplanıyor ama
        hemen ardından atılan exception'a iliştirilmiyordu; worker da
        başarısızlık kaydına bir ÖNCEKİ başarılı fazın metriğini yazıyordu
        (`worker.ts`, `providerResult?.hostMetrics`). Sonuç: "host çekişmesi
        timeout'a yol açıyor mu" sorusu ölçülemez durumdaydı — tam da timeout
        anındaki yük kaydedilmiyordu.
      */
      hostMetrics = await monitor.stop();
      /*
        Araç kapatma sözleşmesinin ihlali çıkış kodundan, iptalden ve zaman aşımından ÖNCE gelir
        (Sol 6.1 2. tur): dış etkili bir araç çalıştıysa ya da olay akışı okunamadıysa çağrının
        sonucu ne olursa olsun koşu düşmeli; zaman aşımı fail-open fazlarda yutulabilir.
      */
      if ((itemCounts?.toolItems ?? 0) > 0) {
        retainedErrorCode = "CODEX_TOOL_ITEM";
        throw new RuntimeProviderExecutionError("CODEX_TOOL_ITEM", diagnostics());
      }
      if (result.eventStreamOverflow) {
        retainedErrorCode = "CODEX_EVENT_STREAM_INVALID";
        throw new RuntimeProviderExecutionError("CODEX_EVENT_STREAM_INVALID", diagnostics());
      }
      if (result.cancelled) throw new RuntimeProviderCancelledError(diagnostics());
      if (result.timedOut) throw new RuntimeProviderTimeoutError(diagnostics());
      if (result.exitCode !== 0 || result.exitSignal !== null) {
        const safeCode = safeCodexFailure(result.stderr, result.exitSignal);
        retainedErrorCode = safeCode;
        throw new RuntimeProviderExecutionError(safeCode, diagnostics());
      }
      let output: unknown;
      try {
        output = JSON.parse(await readFile(outputPath, "utf8")) as unknown;
        retainedOutput = output;
      } catch {
        retainedErrorCode = "CODEX_OUTPUT_INVALID";
        throw new RuntimeProviderExecutionError("CODEX_OUTPUT_INVALID", diagnostics());
      }
      return {
        provider: "codex-cli",
        version: inspected.version,
        model: inspected.model,
        reasoningEffort: inspected.reasoningEffort,
        output,
        durationMs: Date.now() - startedAt,
        hostMetrics,
        diagnostics: diagnostics(),
      };
    } finally {
      if (debugRetentionHours > 0)
        await persistSafeRetainedRuntimeOutput(outputPath, retainedOutput, retainedErrorCode);
      await finalizeRuntimeWorkDirectory(workDirectory, debugRetentionHours);
      scheduleRuntimeWorkDirectoryExpiry(workDirectory, debugRetentionHours);
    }
  }
}
