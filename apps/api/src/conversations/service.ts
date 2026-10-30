import { randomUUID } from "node:crypto";
import {
  LOW_CONFIDENCE,
  MAX_MESSAGES_PER_SESSION,
  type Analyst,
  type ConversationStatus,
  type ConversationSummary,
  type ConversationView,
  type Employee,
  type MessageView,
} from "@nexo/domain";
import type { TicketsService } from "@nexo/tickets-service";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { NexoAgent } from "../agent/nexo-agent.ts";
import { runTurn, type ChatMessage, type TurnEvent } from "../agent/run-turn.ts";
import { createSession } from "../agent/session.ts";
import { schema, type AppDb } from "../db/client.ts";

const { conversations, messages } = schema;
type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

// Erros que a camada HTTP traduz em status e mensagem para a tela.
export class ConversationError extends Error {
  constructor(
    readonly code: "message_limit" | "not_found" | "invalid_state" | "busy",
    message: string,
  ) {
    super(message);
  }
}

export interface ConversationServiceDeps {
  db: AppDb;
  tickets: TicketsService;
  agent: NexoAgent;
  model: string;
  now?: () => Date;
}

export type ConsoleFilter = "all" | "for_you" | "with_agent" | "mine";

export function createConversationService({ db, tickets, agent, model, now = () => new Date() }: ConversationServiceDeps) {
  // Uma mensagem por vez em cada conversa: duas abas mandando juntas não embaralham o estado.
  const busy = new Set<string>();
  const iso = () => now().toISOString();

  async function rowsOf(conversationId: string) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.id));
  }

  async function addMessage(values: Omit<typeof messages.$inferInsert, "createdAt">): Promise<MessageRow> {
    const [row] = await db
      .insert(messages)
      .values({ ...values, createdAt: iso() })
      .returning();
    return row!;
  }

  async function touch(id: string, values: Partial<typeof conversations.$inferInsert>) {
    await db
      .update(conversations)
      .set({ ...values, updatedAt: iso() })
      .where(eq(conversations.id, id));
  }

  async function requireConversation(id: string): Promise<ConversationRow> {
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!row) throw new ConversationError("not_found", "Conversa não encontrada.");
    return row;
  }

  // A conversa em aberto do funcionário ("voltar outro dia e continuar de onde parei").
  async function activeConversation(employeeId: string): Promise<ConversationRow | null> {
    const [row] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.employeeId, employeeId), ne(conversations.status, "closed")))
      .orderBy(desc(conversations.updatedAt))
      .limit(1);
    return row ?? null;
  }

  async function createConversation(employeeId: string): Promise<ConversationRow> {
    const at = iso();
    const [row] = await db
      .insert(conversations)
      .values({ id: randomUUID(), employeeId, status: "with_agent", createdAt: at, updatedAt: at })
      .returning();
    return row!;
  }

  // Histórico para o modelo: as mensagens dele (com ferramentas) e, do analista, só o texto.
  function historyOf(rows: MessageRow[]): ChatMessage[] {
    const history: ChatMessage[] = [];
    for (const m of rows) {
      if (m.role === "user") history.push({ role: "user", content: m.content });
      else if (m.role === "agent") history.push(...((m.modelMessages ?? []) as ChatMessage[]));
      else if (m.role === "analyst") {
        history.push({ role: "assistant", content: `[${m.authorName}, analista do Suporte ${m.authorTeam}]: ${m.content}` });
      }
    }
    return history;
  }

  async function view(row: ConversationRow): Promise<ConversationView> {
    const rows = await rowsOf(row.id);
    const analyst = row.analystId ? await tickets.getAnalyst(row.analystId) : null;
    return {
      id: row.id,
      status: row.status,
      userMessages: row.userMessages,
      messageLimit: MAX_MESSAGES_PER_SESSION,
      pendingDraftId: row.pendingAction?.id ?? null,
      handoff: row.handoff ? { ...row.handoff, team: `Suporte ${row.handoff.team}` } : null,
      analystId: row.analystId,
      analystName: analyst?.name ?? null,
      messages: rows.map(toMessageView),
    };
  }

  return {
    // ---------- funcionário ----------

    async getChat(employee: Employee): Promise<ConversationView> {
      const row = (await activeConversation(employee.id)) ?? (await createConversation(employee.id));
      return view(row);
    },

    async startNewChat(employee: Employee): Promise<ConversationView> {
      const current = await activeConversation(employee.id);
      if (current) await touch(current.id, { status: "closed", closedAt: iso() });
      return view(await createConversation(employee.id));
    },

    async sendMessage(employee: Employee, text: string, onEvent: (e: TurnEvent) => void = () => {}): Promise<ConversationView> {
      const conv = (await activeConversation(employee.id)) ?? (await createConversation(employee.id));
      if (conv.userMessages >= MAX_MESSAGES_PER_SESSION) {
        throw new ConversationError("message_limit", `Limite de ${MAX_MESSAGES_PER_SESSION} mensagens nesta conversa. Comece uma nova.`);
      }
      if (busy.has(conv.id)) throw new ConversationError("busy", "Aguarde a resposta da mensagem anterior.");
      busy.add(conv.id);
      try {
        // Com um analista: a mensagem vai para ele e o agent não responde (Anexo A).
        if (conv.status !== "with_agent") {
          await addMessage({ conversationId: conv.id, role: "user", content: text, authorId: employee.id });
          await touch(conv.id, { userMessages: conv.userMessages + 1 });
          return view(await requireConversation(conv.id));
        }

        const session = createSession(employee, now);
        session.turn = conv.turn;
        session.pendingAction = conv.pendingAction ?? null;
        const history = historyOf(await rowsOf(conv.id));

        // Se o modelo falhar, nada é gravado: o funcionário reenvia a mesma mensagem.
        const result = await runTurn({ agent, model, session, history, text, onEvent });
        if (result.status !== "answered") throw new ConversationError("invalid_state", "Conversa pausada.");

        await addMessage({ conversationId: conv.id, role: "user", content: text, authorId: employee.id });
        await addMessage({
          conversationId: conv.id,
          role: "agent",
          content: result.text,
          widgets: result.widgets,
          trace: result.trace,
          modelMessages: result.newMessages,
        });

        const confidence = result.trace.decision?.confidence;
        const lowConfidence =
          confidence !== undefined && confidence < LOW_CONFIDENCE ? Math.min(confidence, conv.lowConfidence ?? 1) : conv.lowConfidence;
        await touch(conv.id, {
          turn: session.turn,
          pendingAction: session.pendingAction,
          userMessages: conv.userMessages + 1,
          lowConfidence,
          ...(session.handoff && { status: "awaiting_analyst" as const, handoff: session.handoff }),
        });
        if (session.handoff) {
          await addMessage({ conversationId: conv.id, role: "event", content: `Transferida para Suporte ${session.handoff.team}` });
        }
        return view(await requireConversation(conv.id));
      } finally {
        busy.delete(conv.id);
      }
    },

    // ---------- console do analista ----------

    async listForConsole(analyst: Analyst, filter: ConsoleFilter, search = "") {
      const rows = await db.select().from(conversations).orderBy(desc(conversations.updatedAt)).limit(200);
      const summaries: ConversationSummary[] = [];
      for (const row of rows) {
        const employee = await tickets.getEmployee(row.employeeId).catch(() => null);
        if (!employee) continue;
        const [last] = await db
          .select()
          .from(messages)
          .where(and(eq(messages.conversationId, row.id), inArray(messages.role, ["user", "agent", "analyst"])))
          .orderBy(desc(messages.id))
          .limit(1);
        if (!last) continue; // conversa aberta sem nenhuma mensagem ainda
        const analystRow = row.analystId ? await tickets.getAnalyst(row.analystId) : null;
        summaries.push({
          id: row.id,
          employee: { id: employee.id, name: employee.name, department: employee.department },
          status: row.status,
          handoffReason: row.handoff?.reason ?? null,
          ticketId: row.handoff?.ticketId ?? null,
          lowConfidence: row.lowConfidence,
          analystId: row.analystId,
          analystName: analystRow?.name ?? null,
          lastMessage: { role: last.role, content: last.content, createdAt: last.createdAt },
          updatedAt: row.updatedAt,
        });
      }

      const matches: Record<ConsoleFilter, (s: ConversationSummary) => boolean> = {
        all: () => true,
        for_you: (s) => s.status === "awaiting_analyst",
        with_agent: (s) => s.status === "with_agent",
        mine: (s) => s.status === "with_analyst" && s.analystId === analyst.id,
      };
      const counts = Object.fromEntries(
        (Object.keys(matches) as ConsoleFilter[]).map((f) => [f, summaries.filter(matches[f]).length]),
      ) as Record<ConsoleFilter, number>;

      const q = search.trim().toLowerCase();
      const items = summaries
        .filter(matches[filter])
        .filter((s) => !q || s.employee.name.toLowerCase().includes(q) || (s.ticketId ?? "").toLowerCase().includes(q));
      return { items, counts };
    },

    async getForConsole(conversationId: string) {
      const row = await requireConversation(conversationId);
      const employee = await tickets.getEmployee(row.employeeId);
      return { conversation: await view(row), employee };
    },

    async assume(conversationId: string, analyst: Analyst) {
      const row = await requireConversation(conversationId);
      if (row.status === "closed") throw new ConversationError("invalid_state", "Conversa encerrada.");
      if (row.status === "with_analyst" && row.analystId !== analyst.id) {
        throw new ConversationError("invalid_state", "Outro analista já está atendendo.");
      }
      await touch(row.id, { status: "with_analyst", analystId: analyst.id });
      await addMessage({ conversationId: row.id, role: "event", content: `${analyst.name} assumiu · agent pausado` });
    },

    async returnToAgent(conversationId: string, analyst: Analyst) {
      const row = await requireConversation(conversationId);
      if (row.status === "closed") throw new ConversationError("invalid_state", "Conversa encerrada.");
      await touch(row.id, { status: "with_agent", analystId: null, handoff: null, lowConfidence: null });
      await addMessage({ conversationId: row.id, role: "event", content: `${analyst.name} devolveu a conversa ao agent` });
    },

    async close(conversationId: string, analyst: Analyst) {
      const row = await requireConversation(conversationId);
      await touch(row.id, { status: "closed", closedAt: iso() });
      await addMessage({ conversationId: row.id, role: "event", content: `Atendimento encerrado por ${analyst.name}` });
    },

    async sendAnalystMessage(conversationId: string, analyst: Analyst, text: string) {
      const row = await requireConversation(conversationId);
      if (row.status !== "with_analyst" || row.analystId !== analyst.id) {
        throw new ConversationError("invalid_state", "Assuma o atendimento para responder.");
      }
      await addMessage({
        conversationId: row.id,
        role: "analyst",
        content: text,
        authorId: analyst.id,
        authorName: analyst.name,
        authorTeam: analyst.team,
      });
      await touch(row.id, {});
    },
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;

function toMessageView(m: MessageRow): MessageView {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    ...(m.authorName && { authorName: m.authorName }),
    ...(m.authorTeam && { authorTeam: `Suporte ${m.authorTeam}` }),
    createdAt: m.createdAt,
    widgets: m.widgets,
    trace: m.trace ?? null,
  };
}

export type { ConversationStatus };
