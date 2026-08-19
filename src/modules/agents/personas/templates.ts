import { everydayWriterPersonas } from "@/modules/agents/personas/everyday-writer-personas";
import { organicWriterPersonas } from "@/modules/agents/personas/organic-writer-personas";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { seedPersonaPackSchema, type SeedPersona } from "@/modules/agents/personas/schema";

const originalPersonas = seedPersonaPackSchema.parse(originalPersonaPack).personas;

export const agentPersonaTemplates = [
  ...originalPersonas,
  ...everydayWriterPersonas,
  ...organicWriterPersonas,
] as const satisfies readonly SeedPersona[];

export function findAgentPersonaTemplate(username: string): SeedPersona | undefined {
  return agentPersonaTemplates.find((persona) => persona.username === username);
}
