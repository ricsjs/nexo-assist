import { PRIORITY_RULES, type Priority, type SlaUnit, type Ticket, isOpen } from "./ticket.ts";

// Horário do service desk: segunda a sexta, 8h às 18h, horário de Brasília.
// O Brasil não tem horário de verão desde 2019, então o deslocamento é fixo.
export const BUSINESS_HOURS = {
  startHour: 8,
  endHour: 18,
  utcOffsetMinutes: -3 * 60,
} as const;

export const REOPEN_WINDOW_DAYS = 7;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const BUSINESS_DAY_HOURS = BUSINESS_HOURS.endHour - BUSINESS_HOURS.startHour;
const OFFSET = BUSINESS_HOURS.utcOffsetMinutes * MINUTE;

// Trabalhamos com o "relógio de parede" de Brasília guardado num Date em UTC:
// assim getUTCHours() devolve a hora local, sem depender do fuso da máquina.
const toLocal = (d: Date) => new Date(d.getTime() + OFFSET);
const fromLocal = (d: Date) => new Date(d.getTime() - OFFSET);

function atHour(local: Date, hour: number): Date {
  const d = new Date(local);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

const isWeekend = (local: Date) => local.getUTCDay() === 0 || local.getUTCDay() === 6;

// Primeiro instante dentro do expediente a partir de `local` (ele mesmo, se já estiver dentro).
function nextOpening(local: Date): Date {
  let cur = local;
  for (;;) {
    if (isWeekend(cur) || cur.getUTCHours() >= BUSINESS_HOURS.endHour) {
      cur = atHour(new Date(cur.getTime() + DAY), BUSINESS_HOURS.startHour);
    } else if (cur.getUTCHours() < BUSINESS_HOURS.startHour) {
      cur = atHour(cur, BUSINESS_HOURS.startHour);
    } else {
      return cur;
    }
  }
}

function addBusinessHours(start: Date, hours: number): Date {
  let cur = nextOpening(toLocal(start));
  let remaining = hours * HOUR;
  for (;;) {
    const available = atHour(cur, BUSINESS_HOURS.endHour).getTime() - cur.getTime();
    if (remaining <= available) return fromLocal(new Date(cur.getTime() + remaining));
    remaining -= available;
    cur = nextOpening(atHour(cur, BUSINESS_HOURS.endHour));
  }
}

export function addSla(start: Date, amount: number, unit: SlaUnit): Date {
  switch (unit) {
    case "hours":
      return new Date(start.getTime() + amount * HOUR);
    case "business_hours":
      return addBusinessHours(start, amount);
    case "business_days":
      return addBusinessHours(start, amount * BUSINESS_DAY_HOURS);
  }
}

// Prazo a partir de um instante (abertura ou última atualização).
export function slaDeadline(priority: Priority, from: Date): Date {
  const { amount, unit } = PRIORITY_RULES[priority].sla;
  return addSla(from, amount, unit);
}

// O prazo vale para a primeira resposta e para cada atualização (Anexo A),
// então conta a partir da última atualização. Chamado fechado não tem prazo.
export function ticketDeadline(ticket: Pick<Ticket, "priority" | "status" | "updatedAt">): Date | null {
  if (!isOpen(ticket.status)) return null;
  return slaDeadline(ticket.priority, new Date(ticket.updatedAt));
}

export function isOverdue(
  ticket: Pick<Ticket, "priority" | "status" | "updatedAt">,
  now: Date,
): boolean {
  const deadline = ticketDeadline(ticket);
  return deadline !== null && now.getTime() > deadline.getTime();
}

// Chamados resolvidos há até 7 dias podem ser reabertos (Anexo A).
export function canReopen(ticket: Pick<Ticket, "status" | "resolvedAt">, now: Date): boolean {
  if (ticket.status !== "resolved" || ticket.resolvedAt === undefined) return false;
  const elapsed = now.getTime() - new Date(ticket.resolvedAt).getTime();
  return elapsed >= 0 && elapsed <= REOPEN_WINDOW_DAYS * DAY;
}
