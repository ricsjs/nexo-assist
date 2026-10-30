import { canReopen, isOverdue, ticketDeadline, type Decision, type Ticket, type TicketView, type Widget } from "@nexo/domain";

export function toTicketView(t: Ticket, now: Date): TicketView {
  const deadline = ticketDeadline(t);
  return {
    ...t,
    deadline: deadline ? deadline.toISOString() : null,
    overdue: isOverdue(t, now),
    canReopen: canReopen(t, now),
  };
}

// Widget proposto por uma ferramenta durante o turno; selectWidgets decide o que aparece.
export interface WidgetCandidate {
  source: "list" | "duplicates" | "ticket" | "draft" | "done";
  widget: Widget;
}

// Regras de exibição: o que ajuda o funcionário nesta resposta, sem repetir nem poluir.
export function selectWidgets(candidates: WidgetCandidate[], decision: Decision | null): Widget[] {
  const out: Widget[] = [];
  const cards = new Map<string, Widget>();
  let list: Widget | null = null;

  for (const { source, widget } of candidates) {
    if (widget.type === "ticket_card") {
      cards.set(widget.ticket.id, widget); // o mais recente do mesmo chamado vence
    } else if (source === "list") {
      // A lista de seleção só aparece quando o funcionário quer saber de um chamado e há mais de um.
      if (decision?.intent === "ticket_status" && widget.type === "ticket_list" && widget.tickets.length > 1) list = widget;
    } else {
      out.push(widget);
    }
  }
  // Se ele já escolheu um chamado nesta mesma resposta, o card basta.
  if (list && cards.size === 0) out.unshift(list);
  out.push(...cards.values());

  const hasDraft = out.some((w) => w.type === "draft");
  if (!hasDraft && decision?.options?.length) out.push({ type: "quick_replies", options: decision.options });
  return out;
}
