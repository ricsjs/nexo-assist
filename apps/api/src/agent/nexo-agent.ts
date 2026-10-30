import { Agent } from "@mastra/core/agent";
import { NEXO_INSTRUCTIONS } from "./instructions.js";

export function createNexoAgent(model: string) {
  return new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    description: "Agent de atendimento do service desk de TI da Nexo.",
    instructions: NEXO_INSTRUCTIONS,
    model,
  });
}

export type NexoAgent = ReturnType<typeof createNexoAgent>;
