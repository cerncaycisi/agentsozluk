import { formatDirtyTree, inspectCleanTree } from "./clean-tree-policy";

try {
  const entries = inspectCleanTree(process.cwd());
  if (entries.length > 0) {
    process.stderr.write(`${formatDirtyTree(entries)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Clean-tree check passed.\n");
  }
} catch {
  process.stderr.write("Clean-tree check could not complete.\n");
  process.exitCode = 1;
}
