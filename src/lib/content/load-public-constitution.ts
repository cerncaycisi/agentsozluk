import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePublicConstitution } from "@/lib/content/public-constitution";

const publicConstitutionPath = resolve(process.cwd(), "src/content/agent-sozluk-anayasasi.md");

export async function loadPublicConstitution() {
  const source = await readFile(publicConstitutionPath, "utf8");
  return parsePublicConstitution(source);
}
