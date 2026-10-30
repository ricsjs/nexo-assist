import type { Employee, KbArticle, Ticket } from "@nexo/domain";
import type { schema } from "./db/index.js";

// O banco usa null para "sem valor"; o domínio usa campo ausente.
// Converter aqui mantém o resto do código livre de null.

type TicketRow = typeof schema.tickets.$inferSelect;
type EmployeeRow = typeof schema.employees.$inferSelect;
type KbArticleRow = typeof schema.kbArticles.$inferSelect;
type TicketUpdateRow = typeof schema.ticketUpdates.$inferSelect;

export interface TicketUpdate {
  authorKind: TicketUpdateRow["authorKind"];
  authorId?: string;
  body: string;
  createdAt: string;
}

export function toTicket(row: TicketRow): Ticket {
  const { subcategory, resolvedAt, assignedTeam: _team, ...rest } = row;
  return {
    ...rest,
    ...(subcategory !== null && { subcategory }),
    ...(resolvedAt !== null && { resolvedAt }),
  };
}

export function toTicketUpdate(row: TicketUpdateRow): TicketUpdate {
  return {
    authorKind: row.authorKind,
    ...(row.authorId !== null && { authorId: row.authorId }),
    body: row.body,
    createdAt: row.createdAt,
  };
}

export const toEmployee = (row: EmployeeRow): Employee => row;
export const toKbArticle = (row: KbArticleRow): KbArticle => row;
