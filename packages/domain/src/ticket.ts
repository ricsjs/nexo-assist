import { z } from "zod";

// Tipos de chamado (Anexo A): incidente quando algo parou, requisição quando é um pedido.
export const TicketType = z.enum(["INC", "REQ"]);
export type TicketType = z.infer<typeof TicketType>;

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  INC: "Incidente",
  REQ: "Requisição",
};

export const Category = z.enum([
  "access",
  "network_vpn",
  "hardware",
  "software",
  "email",
  "other",
]);
export type Category = z.infer<typeof Category>;

export const CATEGORY_LABEL: Record<Category, string> = {
  access: "Acesso",
  network_vpn: "Rede e VPN",
  hardware: "Hardware",
  software: "Software",
  email: "E-mail",
  other: "Outros",
};

export const Priority = z.enum(["critical", "high", "medium", "low"]);
export type Priority = z.infer<typeof Priority>;

// Prazo de cada prioridade (Anexo A).
export type SlaUnit = "hours" | "business_hours" | "business_days";

export interface PriorityRule {
  label: string;
  whenToUse: string;
  sla: { amount: number; unit: SlaUnit };
}

export const PRIORITY_RULES: Record<Priority, PriorityRule> = {
  critical: {
    label: "Crítica",
    whenToUse: "Algo parado para uma equipe ou para a empresa",
    sla: { amount: 1, unit: "hours" },
  },
  high: {
    label: "Alta",
    whenToUse: "Impede uma pessoa de trabalhar, ou há um compromisso no mesmo dia",
    sla: { amount: 4, unit: "business_hours" },
  },
  medium: {
    label: "Média",
    whenToUse: "Atrapalha, mas há alternativa",
    sla: { amount: 3, unit: "business_days" },
  },
  low: {
    label: "Baixa",
    whenToUse: "Pedidos e melhorias sem urgência",
    sla: { amount: 5, unit: "business_days" },
  },
};

export const TicketStatus = z.enum([
  "awaiting_analyst",
  "in_progress",
  "approved",
  "resolved",
  "cancelled",
]);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  awaiting_analyst: "Aguardando analista",
  in_progress: "Em andamento",
  approved: "Aprovado",
  resolved: "Resolvido",
  cancelled: "Cancelado",
};

export const OPEN_STATUSES: readonly TicketStatus[] = [
  "awaiting_analyst",
  "in_progress",
  "approved",
];

export function isOpen(status: TicketStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

// Impacto: quem está sendo afetado (opções rápidas da Tela 2).
export const Affected = z.enum(["only_me", "my_team", "whole_company", "unknown"]);
export type Affected = z.infer<typeof Affected>;

export const AFFECTED_LABEL: Record<Affected, string> = {
  only_me: "Somente você",
  my_team: "Minha equipe",
  whole_company: "Toda a empresa",
  unknown: "Não sei",
};

// Ex.: INC-20311, REQ-10442
export const TicketId = z.string().regex(/^(INC|REQ)-\d+$/);
export type TicketId = z.infer<typeof TicketId>;

export const Ticket = z.object({
  id: TicketId,
  type: TicketType,
  title: z.string().min(1),
  description: z.string().min(1),
  category: Category,
  subcategory: z.string().optional(),
  priority: Priority,
  status: TicketStatus,
  affected: Affected,
  requesterId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
});
export type Ticket = z.infer<typeof Ticket>;

// O que o agent precisa juntar antes de mostrar o rascunho (Anexo A, "Abertura").
export const TicketDraft = Ticket.pick({
  type: true,
  title: true,
  description: true,
  category: true,
  subcategory: true,
  priority: true,
  affected: true,
});
export type TicketDraft = z.infer<typeof TicketDraft>;
