import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { freemem, loadavg, totalmem } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BYTES_PER_MB = 1024 * 1024;

export interface HostProcessMetrics {
  processPeakRssMb: number;
  systemPeakMemoryMb: number;
  availableMemoryMb: number;
  swapInMb: number;
  swapOutMb: number;
  loadAverage1m: number;
}

interface HostSnapshot {
  processRssMb: number;
  systemUsedMemoryMb: number;
  availableMemoryMb: number;
  swapInMb: number;
  swapOutMb: number;
  loadAverage1m: number;
}

function metric(lines: string, name: string): number | null {
  const match = lines.match(new RegExp(`^${name}\\s*[: ]\\s*(\\d+)`, "mu"));
  return match?.[1] ? Number(match[1]) : null;
}

async function linuxMemory(): Promise<{
  availableMemoryMb: number;
  swapInMb: number;
  swapOutMb: number;
} | null> {
  try {
    const [memory, virtualMemory] = await Promise.all([
      readFile("/proc/meminfo", "utf8"),
      readFile("/proc/vmstat", "utf8"),
    ]);
    const availableKb = metric(memory, "MemAvailable");
    const swapInPages = metric(virtualMemory, "pswpin");
    const swapOutPages = metric(virtualMemory, "pswpout");
    if (availableKb === null || swapInPages === null || swapOutPages === null) return null;
    return {
      availableMemoryMb: availableKb / 1024,
      swapInMb: (swapInPages * 4096) / BYTES_PER_MB,
      swapOutMb: (swapOutPages * 4096) / BYTES_PER_MB,
    };
  } catch {
    return null;
  }
}

async function macSwap(): Promise<{ swapInMb: number; swapOutMb: number } | null> {
  try {
    const { stdout } = await execFileAsync("vm_stat", [], { timeout: 2000, maxBuffer: 128_000 });
    const pageSize = Number(stdout.match(/page size of (\d+) bytes/u)?.[1] ?? 4096);
    const swapInPages = metric(stdout, "Swapins");
    const swapOutPages = metric(stdout, "Swapouts");
    if (swapInPages === null || swapOutPages === null) return null;
    return {
      swapInMb: (swapInPages * pageSize) / BYTES_PER_MB,
      swapOutMb: (swapOutPages * pageSize) / BYTES_PER_MB,
    };
  } catch {
    return null;
  }
}

function descendantRss(psOutput: string, rootPid: number): number {
  const rows = psOutput
    .split("\n")
    .map((line) => line.trim().split(/\s+/u).map(Number))
    .filter(
      (row): row is [number, number, number] =>
        row.length === 3 && row.every((value) => Number.isFinite(value)),
    );
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parentPid] of rows) {
      if (descendants.has(parentPid) && !descendants.has(pid)) {
        descendants.add(pid);
        changed = true;
      }
    }
  }
  return rows.reduce((total, [pid, , rssKb]) => total + (descendants.has(pid) ? rssKb : 0), 0);
}

async function processRssMb(pid: number | undefined): Promise<number> {
  if (!pid) return 0;
  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss="], {
      timeout: 2000,
      maxBuffer: 2_000_000,
    });
    return descendantRss(stdout, pid) / 1024;
  } catch {
    return 0;
  }
}

async function snapshot(pid: number | undefined): Promise<HostSnapshot> {
  const [rss, linux, mac] = await Promise.all([
    processRssMb(pid),
    linuxMemory(),
    process.platform === "darwin" ? macSwap() : Promise.resolve(null),
  ]);
  const availableMemoryMb = linux?.availableMemoryMb ?? freemem() / BYTES_PER_MB;
  const totalMemoryMb = totalmem() / BYTES_PER_MB;
  return {
    processRssMb: rss,
    systemUsedMemoryMb: Math.max(0, totalMemoryMb - availableMemoryMb),
    availableMemoryMb,
    swapInMb: linux?.swapInMb ?? mac?.swapInMb ?? 0,
    swapOutMb: linux?.swapOutMb ?? mac?.swapOutMb ?? 0,
    loadAverage1m: loadavg()[0] ?? 0,
  };
}

export function monitorHostProcess(
  pid: number | undefined,
  intervalMs = 200,
): { stop: () => Promise<HostProcessMetrics> } {
  let start: HostSnapshot | null = null;
  let latest: HostSnapshot | null = null;
  let processPeakRssMb = 0;
  let systemPeakMemoryMb = 0;
  let minimumAvailableMemoryMb = Number.POSITIVE_INFINITY;
  let maximumLoadAverage1m = 0;
  let pending = Promise.resolve();
  const sample = () => {
    pending = pending.then(async () => {
      const next = await snapshot(pid);
      start ??= next;
      latest = next;
      processPeakRssMb = Math.max(processPeakRssMb, next.processRssMb);
      systemPeakMemoryMb = Math.max(systemPeakMemoryMb, next.systemUsedMemoryMb);
      minimumAvailableMemoryMb = Math.min(minimumAvailableMemoryMb, next.availableMemoryMb);
      maximumLoadAverage1m = Math.max(maximumLoadAverage1m, next.loadAverage1m);
    });
  };
  sample();
  const interval = setInterval(sample, intervalMs);
  interval.unref();
  return {
    async stop() {
      clearInterval(interval);
      sample();
      await pending;
      return {
        processPeakRssMb,
        systemPeakMemoryMb,
        availableMemoryMb: Number.isFinite(minimumAvailableMemoryMb) ? minimumAvailableMemoryMb : 0,
        swapInMb: Math.max(0, (latest?.swapInMb ?? 0) - (start?.swapInMb ?? 0)),
        swapOutMb: Math.max(0, (latest?.swapOutMb ?? 0) - (start?.swapOutMb ?? 0)),
        loadAverage1m: maximumLoadAverage1m,
      };
    },
  };
}
