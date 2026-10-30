import {
  canReopen,
  OPEN_STATUSES,
  TicketDraft,
  type Employee,
  type SupportTeam,
  type Ticket,
  type TicketType,
} from "@nexo/domain";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { schema, type Db } from "./db/index.js";
import {
  EmployeeNotFoundError,
  InvalidDraftError,
  ReopenNotAllowedError,
  TicketNotFoundError,
} from "./errors.js";
import { rankArticles, type KbMatch } from "./knowledge.js";
import { toEmployee, toKbArticle, toTicket, toTicketUpdate, type TicketUpdate } from "./mappers.js";

const { tickets, ticketUpdates, employees, kbArticles } = schema;

export type TicketFilter = "open" | "closed" | "all";

export interface TicketWithHistory extends Ticket {
  history: TicketUpdate[];
}

export interface TicketsServiceOptions {
  db: Db;
  now?: () => Date;
}

// Toda operação sobre chamados recebe o funcionário e filtra por ele: o serviço,
// e não o agent, garante que ninguém vê chamado de outra pessoa.
export function createTicketsService({ db, now = () => new Date() }: TicketsServiceOptions) {
  const ownTicket = (employeeId: string, ticketId: string) =>
    and(eq(tickets.id, ticketId), eq(tickets.requesterId, employeeId));

  async function requireOwnTicket(employeeId: string, ticketId: string) {
    const [row] = await db.select().from(tickets).where(ownTicket(employeeId, ticketId));
    if (!row) throw new TicketNotFoundError(ticketId);
    return row;
  }

  return {
    async findEmployeeByEmail(email: string): Promise<Employee | null> {
      const [row] = await db
        .select()
        .from(employees)
        .where(eq(employees.email, email.trim().toLowerCase()));
      return row ? toEmployee(row) : null;
    },

    async getEmployee(employeeId: string): Promise<Employee> {
      const [row] = await db.select().from(employees).where(eq(employees.id, employeeId));
      if (!row) throw new EmployeeNotFoundError(employeeId);
      return toEmployee(row);
    },

    // Mais recentes primeiro, como na lista de seleção da Tela 3.
    async listTickets(employeeId: string, filter: TicketFilter = "open"): Promise<Ticket[]> {
      const statusFilter =
        filter === "open"
          ? inArray(tickets.status, [...OPEN_STATUSES])
          : filter === "closed"
            ? notInArray(tickets.status, [...OPEN_STATUSES])
            : undefined;
      const rows = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.requesterId, employeeId), statusFilter))
        .orderBy(desc(tickets.updatedAt));
      return rows.map(toTicket);
    },

    async getTicket(employeeId: string, ticketId: string): Promise<TicketWithHistory> {
      const row = await requireOwnTicket(employeeId, ticketId);
      const history = await db
        .select()
        .from(ticketUpdates)
        .where(eq(ticketUpdates.ticketId, ticketId))
        .orderBy(ticketUpdates.createdAt);
      return { ...toTicket(row), history: history.map(toTicketUpdate) };
    },

    // Só chamado com todos os campos do Anexo A vira chamado.
    async createTicket(employeeId: string, draft: unknown): Promise<Ticket> {
      const parsed = TicketDraft.safeParse(draft);
      if (!parsed.success) {
        throw new InvalidDraftError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
      }
      await this.getEmployee(employeeId);

      const at = now().toISOString();
      return db.transaction(async (tx) => {
        const id = await nextTicketId(tx, parsed.data.type);
        const [row] = await tx
          .insert(tickets)
          .values({
            ...parsed.data,
            id,
            status: "awaiting_analyst",
            requesterId: employeeId,
            createdAt: at,
            updatedAt: at,
          })
          .returning();
        await tx.insert(ticketUpdates).values({
          ticketId: id,
          authorKind: "agent",
          body: "Chamado aberto pelo Nexo Assist após confirmação do funcionário.",
          createdAt: at,
        });
        return toTicket(row!);
      });
    },

    // Complemento do funcionário (história 3). Não mexe em updatedAt: o prazo conta
    // da última atualização do atendimento, e complementar não pode "zerar" um vencido.
    async addComment(employeeId: string, ticketId: string, body: string): Promise<TicketWithHistory> {
      await requireOwnTicket(employeeId, ticketId);
      await db.insert(ticketUpdates).values({
        ticketId,
        authorKind: "employee",
        authorId: employeeId,
        body,
        createdAt: now().toISOString(),
      });
      return this.getTicket(employeeId, ticketId);
    },

    async reopenTicket(employeeId: string, ticketId: string, reason: string): Promise<TicketWithHistory> {
      const row = await requireOwnTicket(employeeId, ticketId);
      const current = toTicket(row);
      if (!canReopen(current, now())) throw new ReopenNotAllowedError(ticketId);

      const at = now().toISOString();
      await db.transaction(async (tx) => {
        await tx
          .update(tickets)
          .set({ status: "awaiting_analyst", resolvedAt: null, updatedAt: at })
          .where(eq(tickets.id, ticketId));
        await tx.insert(ticketUpdates).values({
          ticketId,
          authorKind: "employee",
          authorId: employeeId,
          body: `Chamado reaberto: ${reason}`,
          createdAt: at,
        });
      });
      return this.getTicket(employeeId, ticketId);
    },

    // Encaminha para um time do service desk com o resumo do caso (Anexo A, "Transferência").
    async transferTicket(
      employeeId: string,
      ticketId: string,
      team: SupportTeam,
      summary: string,
    ): Promise<TicketWithHistory> {
      await requireOwnTicket(employeeId, ticketId);
      await db.transaction(async (tx) => {
        await tx.update(tickets).set({ assignedTeam: team }).where(eq(tickets.id, ticketId));
        await tx.insert(ticketUpdates).values({
          ticketId,
          authorKind: "system",
          body: `Transferido para o Suporte ${team}. Resumo: ${summary}`,
          createdAt: now().toISOString(),
        });
      });
      return this.getTicket(employeeId, ticketId);
    },

    async searchKnowledge(query: string, limit = 3): Promise<KbMatch[]> {
      const rows = await db.select().from(kbArticles);
      return rankArticles(rows.map(toKbArticle), query, limit);
    },
  };
}

export type TicketsService = ReturnType<typeof createTicketsService>;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// INC-20320 → INC-20321. Roda dentro da transação da criação para dois chamados
// criados ao mesmo tempo não receberem o mesmo número.
async function nextTicketId(tx: Tx, type: TicketType): Promise<string> {
  const [result] = await tx
    .select({ max: sql<number | null>`max(cast(substr(${tickets.id}, 5) as integer))` })
    .from(tickets)
    .where(eq(tickets.type, type));
  const start = type === "INC" ? 20000 : 10000;
  return `${type}-${(result?.max ?? start) + 1}`;
}
