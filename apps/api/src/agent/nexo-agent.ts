import { Agent } from "@mastra/core/agent";
import type { TicketsService } from "@nexo/tickets-service";
import { NEXO_INSTRUCTIONS } from "./instructions.js";
import { createNexoTools } from "./tools.js";

export function createNexoAgent(model: string, tickets: TicketsService) {
  return new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    description: "Agent de atendimento do service desk de TI da Nexo.",
    instructions: NEXO_INSTRUCTIONS,
    model,
    tools: createNexoTools(tickets),
  });
}

export type NexoAgent = ReturnType<typeof createNexoAgent>;

// Limite de idas e voltas modelo → ferramenta por mensagem: protege custo e evita laço.
export const MAX_STEPS_PER_MESSAGE = 6;
