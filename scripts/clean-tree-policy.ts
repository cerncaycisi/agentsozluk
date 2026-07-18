import { spawnSync } from "node:child_process";

export interface DirtyTreeEntry {
  status: string;
  path: string;
  originalPath?: string;
}

function compareEntries(left: DirtyTreeEntry, right: DirtyTreeEntry): number {
  return [left.status, left.path, left.originalPath ?? ""]
    .join("\0")
    .localeCompare([right.status, right.path, right.originalPath ?? ""].join("\0"), "en");
}

export function inspectCleanTree(repositoryRoot: string): DirtyTreeEntry[] {
  const result = spawnSync(
    "git",
    ["-C", repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all", "-z"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") {
    throw new Error("CLEAN_TREE_GIT_COMMAND_FAILED");
  }

  const records = result.stdout.split("\0");
  const entries: DirtyTreeEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    const currentPath = record.slice(3);
    if (!currentPath) throw new Error("CLEAN_TREE_STATUS_INVALID");
    const renamedOrCopied = [status[0], status[1]].some((code) => code === "R" || code === "C");
    const originalPath = renamedOrCopied ? records[(index += 1)] : undefined;
    entries.push({
      status,
      path: currentPath,
      ...(originalPath ? { originalPath } : {}),
    });
  }
  return entries.sort(compareEntries);
}

function printablePath(value: string): string {
  return JSON.stringify(value);
}

export function formatDirtyTree(entries: readonly DirtyTreeEntry[]): string {
  return [
    `Clean-tree check failed: ${entries.length} changed path(s).`,
    ...entries.map(
      (entry) =>
        `status=${JSON.stringify(entry.status)} path=${printablePath(entry.path)}${
          entry.originalPath ? ` originalPath=${printablePath(entry.originalPath)}` : ""
        }`,
    ),
  ].join("\n");
}
