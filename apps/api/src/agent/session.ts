import type { Employee, HandoffReason, SupportTeam, TicketDraft } from "@nexo/domain";

// Ação que o agent preparou e que só roda depois que o funcionário confirmar (Anexo A, "Abertura").
export type PendingAction =
  | { kind: "create"; id: string; draft: TicketDraft; proposedAtTurn: number }
  | { kind: "comment"; id: string; ticketId: string; text: string; proposedAtTurn: number }
  | { kind: "reopen"; id: string; ticketId: string; reason: string; proposedAtTurn: number };

export interface Handoff {
  reason: HandoffReason;
  team: SupportTeam;
  summary: string;
  ticketId?: string;
}

// Estado de uma conversa visto pelas ferramentas. Chega a elas pelo requestContext do Mastra,
// nunca pelos argumentos do modelo: o LLM não escolhe de quem são os chamados que consulta.
export interface AgentSession {
  employee: Employee;
  // Quantas mensagens o funcionário já mandou; usado para exigir confirmação em turno posterior.
  turn: number;
  pendingAction: PendingAction | null;
  handoff: Handoff | null;
  now: () => Date;
}

export function createSession(employee: Employee, now: () => Date = () => new Date()): AgentSession {
  return { employee, turn: 0, pendingAction: null, handoff: null, now };
}

export type NexoRequestContext = { session: AgentSession };
