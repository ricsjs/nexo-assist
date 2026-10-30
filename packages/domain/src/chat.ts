import type { ConversationStatus, HandoffReason } from "./conversation.js";
import type { TurnTrace } from "./decision.js";
import type { Affected, Category, Priority, Ticket, TicketType } from "./ticket.js";

// Contrato entre o api e a interface: o que cada tela recebe.

// Chamado pronto para exibir: códigos (para cor e ícone) e prazos já calculados pelo domínio.
export type TicketView = Ticket & {
  deadline: string | null;
  overdue: boolean;
  canReopen: boolean;
};

export interface DraftView {
  draftId: string;
  kind: "create" | "comment" | "reopen";
  ticketId?: string;
  type?: TicketType;
  title: string;
  description: string;
  category?: Category;
  priority?: Priority;
  affected?: Affected;
  firstResponseBy?: string;
}

// Elementos estruturados de uma resposta, montados pelo código a partir das ferramentas
// (nunca do texto do modelo): o que aparece no card é o que está no sistema.
export type Widget =
  | { type: "ticket_list"; tickets: TicketView[] }
  | { type: "ticket_card"; ticket: TicketView; note?: string }
  | { type: "draft"; draft: DraftView }
  | { type: "quick_replies"; options: string[] };

export type MessageRole = "user" | "agent" | "analyst" | "event";

export interface MessageView {
  id: number;
  role: MessageRole;
  content: string;
  authorName?: string;
  authorTeam?: string;
  createdAt: string;
  widgets: Widget[];
  trace: TurnTrace | null;
}

export interface ConversationView {
  id: string;
  status: ConversationStatus;
  // Mensagens do funcionário nesta conversa e o limite (PRD: 30 por sessão).
  userMessages: number;
  messageLimit: number;
  // Rascunho que ainda aceita Confirmar / Cancelar.
  pendingDraftId: string | null;
  handoff: { reason: HandoffReason; team: string; summary: string; ticketId?: string } | null;
  analystName: string | null;
  messages: MessageView[];
}

export interface SessionUser {
  kind: "employee" | "analyst";
  id: string;
  name: string;
  email: string;
  department?: string;
  team?: string;
  passwordChangedAt?: string;
}

// Linha da lista de conversas do console do analista (Tela 4).
export interface ConversationSummary {
  id: string;
  employee: { id: string; name: string; department: string };
  status: ConversationStatus;
  handoffReason: HandoffReason | null;
  ticketId: string | null;
  lowConfidence: number | null;
  analystId: string | null;
  analystName: string | null;
  lastMessage: { role: MessageRole; content: string; createdAt: string } | null;
  updatedAt: string;
}
