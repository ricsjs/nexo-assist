import { createTool } from "@mastra/core/tools";
import {
  AFFECTED_LABEL,
  canReopen,
  CATEGORY_LABEL,
  Decision,
  HandoffReason,
  isOverdue,
  LOW_CONFIDENCE,
  PRIORITY_RULES,
  slaDeadline,
  TICKET_STATUS_LABEL,
  TICKET_TYPE_LABEL,
  TicketDraft,
  ticketDeadline,
  type SupportTeam,
  type Ticket,
} from "@nexo/domain";
import { TicketsServiceError, type TicketsService } from "@nexo/tickets-service";
import { z } from "zod";
import { formatDateTime, formatRelative } from "../lib/format.js";
import type { AgentSession, NexoRequestContext, PendingAction } from "./session.js";
import { toTicketView } from "./widgets.js";

// ---------- apoio ----------

type ToolContext = { requestContext?: { get(key: "session"): unknown } };

function sessionOf(ctx: ToolContext): AgentSession {
  const session = ctx.requestContext?.get("session") as AgentSession | undefined;
  if (!session) throw new Error("Ferramenta chamada sem sessão: o funcionário precisa estar identificado.");
  return session;
}

// Erros do serviço viram dados para o modelo explicar ao funcionário, em vez de derrubar a conversa.
type ToolError = { ok: false; error: string; message: string };

async function attempt<T extends object>(fn: () => Promise<T>): Promise<({ ok: true } & T) | ToolError> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (error) {
    if (error instanceof TicketsServiceError) return { ok: false, error: error.code, message: error.message };
    throw error;
  }
}

const fail = (error: string, message: string): ToolError => ({ ok: false, error, message });

// O que o modelo vê de um chamado: rótulos em português e prazos já calculados pelas regras do domínio.
function describeTicket(t: Ticket, now: Date) {
  const deadline = ticketDeadline(t);
  return {
    id: t.id,
    type: TICKET_TYPE_LABEL[t.type],
    title: t.title,
    description: t.description,
    category: t.subcategory ? `${CATEGORY_LABEL[t.category]} › ${t.subcategory}` : CATEGORY_LABEL[t.category],
    priority: PRIORITY_RULES[t.priority].label,
    status: TICKET_STATUS_LABEL[t.status],
    openedAt: formatDateTime(new Date(t.createdAt)),
    lastUpdate: formatRelative(new Date(t.updatedAt), now),
    deadline: deadline ? formatDateTime(deadline) : null,
    overdue: isOverdue(t, now),
    canReopen: canReopen(t, now),
  };
}

const newDraftId = () => `D-${100 + Math.floor(Math.random() * 900)}`;

// Críticos e vencidos vão para o N2; o resto começa no N1.
export function teamFor(reason: HandoffReason): SupportTeam {
  return reason === "critical" || reason === "overdue_ticket" ? "N2" : "N1";
}

// ---------- ferramentas ----------

export function createNexoTools(tickets: TicketsService) {
  // Transparência: o modelo declara o que entendeu, o que vai fazer, com que segurança e por quê.
  const recordDecision = createTool({
    id: "record_decision",
    description:
      "Registra sua interpretação da mensagem do funcionário. Chame em TODA mensagem, antes de responder " +
      "(pode ser junto com as outras ferramentas).",
    inputSchema: Decision,
    execute: async (decision, ctx) => {
      const session = sessionOf(ctx);
      session.decision = decision;
      if (decision.confidence < LOW_CONFIDENCE && decision.intent !== "out_of_scope") {
        return {
          ok: true,
          hint: "Confiança baixa: transfira para um analista (handoff_to_analyst com reason low_confidence) e explique ao funcionário.",
        };
      }
      return { ok: true };
    },
  });

  const searchHelpCenter = createTool({
    id: "search_help_center",
    description:
      "Busca artigos da central de ajuda. Use antes de abrir chamado para dúvidas e problemas comuns. " +
      "Leia as condições do artigo (ex.: vale só para Windows 10) antes de sugerir a solução.",
    inputSchema: z.object({ query: z.string().min(2).describe("Palavras-chave do problema ou dúvida") }),
    execute: async ({ query }) =>
      attempt(async () => ({
        articles: (await tickets.searchKnowledge(query)).map(({ article }) => ({
          id: article.id,
          title: article.title,
          body: article.body,
        })),
      })),
  });

  const listMyTickets = createTool({
    id: "list_my_tickets",
    description:
      "Lista os chamados do funcionário logado, do mais recente para o mais antigo, com status, prazo e se está vencido.",
    inputSchema: z.object({
      status: z.enum(["open", "closed", "all"]).default("open").describe("open = em aberto; closed = resolvidos/cancelados"),
    }),
    execute: async ({ status }, ctx) => {
      const session = sessionOf(ctx);
      return attempt(async () => {
        const list = await tickets.listTickets(session.employee.id, status);
        session.widgets.push({
          source: "list",
          widget: { type: "ticket_list", tickets: list.map((t) => toTicketView(t, session.now())) },
        });
        return { tickets: list.map((t) => describeTicket(t, session.now())) };
      });
    },
  });

  const getTicket = createTool({
    id: "get_ticket",
    description: "Detalhes e histórico de um chamado do funcionário logado.",
    inputSchema: z.object({ ticketId: z.string().describe("Ex.: INC-20311 ou REQ-10442") }),
    execute: async ({ ticketId }, ctx) => {
      const session = sessionOf(ctx);
      return attempt(async () => {
        const ticket = await tickets.getTicket(session.employee.id, ticketId.trim().toUpperCase());
        session.widgets.push({ source: "ticket", widget: { type: "ticket_card", ticket: toTicketView(ticket, session.now()) } });
        return {
          ticket: describeTicket(ticket, session.now()),
          history: ticket.history.map((h) => ({
            by: h.authorKind,
            text: h.body,
            when: formatRelative(new Date(h.createdAt), session.now()),
          })),
        };
      });
    },
  });

  const draftTicket = createTool({
    id: "draft_ticket",
    description:
      "Monta o rascunho de um chamado novo para o funcionário conferir. NÃO cria o chamado: " +
      "mostre o rascunho e espere a confirmação. Verifica duplicidade com os chamados abertos.",
    inputSchema: TicketDraft.extend({
      priorityReason: z.string().describe("Por que esta prioridade, citando impacto e urgência"),
      ignoreDuplicates: z
        .boolean()
        .default(false)
        .describe("true só se o funcionário confirmou que é um problema diferente do chamado parecido"),
    }),
    execute: async ({ priorityReason, ignoreDuplicates, ...draft }, ctx) => {
      const session = sessionOf(ctx);
      return attempt(async () => {
        if (!ignoreDuplicates) {
          const duplicates = await tickets.findPossibleDuplicates(session.employee.id, draft);
          if (duplicates.length > 0) {
            session.widgets.push({
              source: "duplicates",
              widget: { type: "ticket_list", tickets: duplicates.map((t) => toTicketView(t, session.now())) },
            });
            return {
              created: false,
              possibleDuplicates: duplicates.map((t) => describeTicket(t, session.now())),
              hint: "Já existe chamado aberto parecido. Pergunte se é o mesmo problema e ofereça complementá-lo.",
            };
          }
        }
        const pending: PendingAction = {
          kind: "create",
          id: newDraftId(),
          draft,
          proposedAtTurn: session.turn,
        };
        session.pendingAction = pending;
        const firstResponseBy = slaDeadline(draft.priority, session.now());
        session.widgets.push({
          source: "draft",
          widget: {
            type: "draft",
            draft: { draftId: pending.id, kind: "create", ...draft, firstResponseBy: firstResponseBy.toISOString() },
          },
        });
        return {
          created: false,
          draftId: pending.id,
          draft: {
            type: TICKET_TYPE_LABEL[draft.type],
            title: draft.title,
            description: draft.description,
            category: CATEGORY_LABEL[draft.category],
            priority: PRIORITY_RULES[draft.priority].label,
            affected: AFFECTED_LABEL[draft.affected],
            firstResponseBy: formatDateTime(firstResponseBy),
          },
          priorityReason,
          nextStep: `Mostre o rascunho e pergunte se pode criar. Quando o funcionário confirmar, chame confirm_pending_action com draftId ${pending.id}, sem montar outro rascunho.`,
        };
      });
    },
  });

  const draftTicketUpdate = createTool({
    id: "draft_ticket_update",
    description:
      "Prepara um complemento ou a reabertura de um chamado existente para o funcionário confirmar. " +
      "Use em vez de abrir chamado novo quando o problema já tem chamado. Reabrir só vale para resolvidos há até 7 dias.",
    inputSchema: z.object({
      ticketId: z.string(),
      kind: z.enum(["comment", "reopen"]),
      text: z.string().min(3).describe("Informação nova, ou o motivo da reabertura"),
    }),
    execute: async ({ ticketId, kind, text }, ctx) => {
      const session = sessionOf(ctx);
      return attempt(async () => {
        const ticket = await tickets.getTicket(session.employee.id, ticketId.trim().toUpperCase());
        if (kind === "reopen" && !canReopen(ticket, session.now())) {
          return { created: false, error: "reopen_not_allowed", hint: "Fora da janela de 7 dias: ofereça abrir um chamado novo." };
        }
        const id = newDraftId();
        session.pendingAction =
          kind === "comment"
            ? { kind, id, ticketId: ticket.id, text, proposedAtTurn: session.turn }
            : { kind, id, ticketId: ticket.id, reason: text, proposedAtTurn: session.turn };
        session.widgets.push({
          source: "draft",
          widget: { type: "draft", draft: { draftId: id, kind, ticketId: ticket.id, title: ticket.title, description: text } },
        });
        return {
          created: false,
          draftId: id,
          action: kind === "comment" ? "complementar" : "reabrir",
          ticket: describeTicket(ticket, session.now()),
          text,
          nextStep: `Mostre o que será enviado e espere a confirmação. Depois do sim, chame confirm_pending_action com draftId ${id}.`,
        };
      });
    },
  });

  const confirmPendingAction = createTool({
    id: "confirm_pending_action",
    description:
      "Executa o rascunho pendente (criar, complementar ou reabrir) DEPOIS que o funcionário confirmou na mensagem dele.",
    inputSchema: z.object({ draftId: z.string() }),
    execute: async ({ draftId }, ctx) => {
      const session = sessionOf(ctx);
      const pending = session.pendingAction;
      if (!pending) return fail("no_pending_action", "Não há rascunho pendente. Monte um rascunho primeiro.");
      if (pending.id !== draftId) return fail("draft_mismatch", `O rascunho pendente é ${pending.id}.`);
      // Garantia em código: a confirmação precisa vir numa mensagem do funcionário
      // posterior ao rascunho. O modelo não consegue "confirmar sozinho" no mesmo turno.
      if (pending.proposedAtTurn >= session.turn) {
        return fail("not_confirmed_yet", "Mostre o rascunho e espere o funcionário confirmar antes de executar.");
      }
      return attempt(async () => {
        const id = session.employee.id;
        const ticket =
          pending.kind === "create"
            ? await tickets.createTicket(id, pending.draft)
            : pending.kind === "comment"
              ? await tickets.addComment(id, pending.ticketId, pending.text)
              : await tickets.reopenTicket(id, pending.ticketId, pending.reason);
        session.pendingAction = null;
        const note = pending.kind === "create" ? "Chamado criado" : pending.kind === "reopen" ? "Chamado reaberto" : "Informação adicionada";
        session.widgets.push({ source: "done", widget: { type: "ticket_card", ticket: toTicketView(ticket, session.now()), note } });
        return { done: pending.kind, ticket: describeTicket(ticket, session.now()) };
      });
    },
  });

  const cancelPendingAction = createTool({
    id: "cancel_pending_action",
    description: "Descarta o rascunho pendente quando o funcionário desiste.",
    inputSchema: z.object({}),
    execute: async (_input, ctx) => {
      const session = sessionOf(ctx);
      const discarded = session.pendingAction?.id ?? null;
      session.pendingAction = null;
      return { ok: true, discarded };
    },
  });

  const handoffToAnalyst = createTool({
    id: "handoff_to_analyst",
    description:
      "Transfere a conversa para um analista humano. Use quando o funcionário pedir, em caso crítico, " +
      "em chamado vencido (depois de oferecer) ou quando você não tiver segurança sobre o que fazer. " +
      "Depois disso você não responde mais nesta conversa.",
    inputSchema: z.object({
      reason: HandoffReason,
      summary: z
        .string()
        .min(20)
        .describe("Resumo para o analista não precisar perguntar tudo de novo: problema, o que já foi tentado, urgência"),
      ticketId: z.string().optional().describe("Chamado relacionado, se houver"),
    }),
    execute: async ({ reason, summary, ticketId }, ctx) => {
      const session = sessionOf(ctx);
      const team = teamFor(reason);
      return attempt(async () => {
        if (ticketId) await tickets.transferTicket(session.employee.id, ticketId.trim().toUpperCase(), team, summary);
        session.handoff = { reason, team, summary, ...(ticketId && { ticketId: ticketId.trim().toUpperCase() }) };
        session.pendingAction = null;
        return { team: `Suporte ${team}`, message: "Conversa transferida. Avise que um analista vai assumir e encerre." };
      });
    },
  });

  return {
    record_decision: recordDecision,
    search_help_center: searchHelpCenter,
    list_my_tickets: listMyTickets,
    get_ticket: getTicket,
    draft_ticket: draftTicket,
    draft_ticket_update: draftTicketUpdate,
    confirm_pending_action: confirmPendingAction,
    cancel_pending_action: cancelPendingAction,
    handoff_to_analyst: handoffToAnalyst,
  };
}

export type NexoTools = ReturnType<typeof createNexoTools>;
export type { NexoRequestContext };
