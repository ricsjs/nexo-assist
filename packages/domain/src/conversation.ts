import { z } from "zod";

// Com quem a conversa está (precisa sobreviver a um reinício).
export const ConversationStatus = z.enum([
  "with_agent",
  "awaiting_analyst",
  "with_analyst",
  "closed",
]);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

export const CONVERSATION_STATUS_LABEL: Record<ConversationStatus, string> = {
  with_agent: "Agent atendendo",
  awaiting_analyst: "Aguardando atendente",
  with_analyst: "Analista atendendo",
  closed: "Encerrada",
};

// Por que a conversa foi para um analista (Anexo A, "Transferência").
export const HandoffReason = z.enum([
  "user_request",
  "critical",
  "overdue_ticket",
  "low_confidence",
]);
export type HandoffReason = z.infer<typeof HandoffReason>;

export const HANDOFF_REASON_LABEL: Record<HandoffReason, string> = {
  user_request: "Funcionário pediu",
  critical: "Caso crítico",
  overdue_ticket: "Chamado vencido",
  low_confidence: "Agent pediu ajuda",
};

export const MAX_MESSAGES_PER_SESSION = 30;
