import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

/** Git artifact ile host runtime arasında aynı kaynak; .env/node_modules/build çıktısı yok. */
export function resetImplementationHash(root: string): string {
  if (realpathSync(root) !== root) throw new Error("GREAT_RESET_IMPLEMENTATION_PATH_INVALID");
  const paths: string[] = [];
  function visit(relative: string) {
    const path = join(root, relative);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("GREAT_RESET_IMPLEMENTATION_SYMLINK_INVALID");
    if (stat.isDirectory()) {
      for (const child of readdirSync(path)) visit(`${relative}/${child}`);
    } else if (stat.isFile()) paths.push(relative);
    else throw new Error("GREAT_RESET_IMPLEMENTATION_PATH_INVALID");
  }
  for (const directory of ["src", "prisma", "scripts"]) visit(directory);
  for (const file of ["Dockerfile", "package.json", "pnpm-lock.yaml", "tsconfig.json"]) visit(file);
  const hash = createHash("sha256");
  for (const relative of paths.sort()) {
    hash.update(relative).update("\0");
    hash.update(
      createHash("sha256")
        .update(readFileSync(join(root, relative)))
        .digest("hex"),
    );
    hash.update("\n");
  }
  return hash.digest("hex");
}
