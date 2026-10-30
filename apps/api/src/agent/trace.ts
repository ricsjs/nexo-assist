import type { TraceStep } from "@nexo/domain";

// Traduz cada chamada de ferramenta em passos legíveis, como os do protótipo
// ("consultou seus chamados", "classificou a prioridade"). Vem do que de fato rodou,
// então o modelo não consegue declarar uma ação que não fez.

type Result = {
  ok?: boolean;
  message?: string;
  error?: string;
  articles?: { title: string }[];
  tickets?: { id: string; overdue: boolean }[];
  ticket?: { id: string; status: string; overdue: boolean; deadline: string | null };
  possibleDuplicates?: { id: string }[];
  draftId?: string;
  draft?: { priority: string; firstResponseBy: string };
  priorityReason?: string;
  action?: string;
  done?: "create" | "comment" | "reopen";
  team?: string;
  discarded?: string | null;
};

type Args = { ticketId?: string; kind?: string; reason?: string };

const step = (tool: string, label: string, summary: string, ok = true): TraceStep => ({ tool, label, ok, summary });

export function describeToolCall(tool: string, args: unknown, raw: unknown): TraceStep[] {
  const a = (args ?? {}) as Args;
  const r = (raw ?? {}) as Result;

  if (r.ok === false) {
    const label = tool === "confirm_pending_action" ? "tentou confirmar" : `falhou: ${tool}`;
    return [step(tool, label, r.message ?? r.error ?? "erro", false)];
  }

  switch (tool) {
    case "search_help_center": {
      const titles = r.articles?.map((x) => x.title) ?? [];
      return [step(tool, "buscou na central de ajuda", titles.length ? titles.join("; ") : "nenhum artigo encontrado")];
    }
    case "list_my_tickets": {
      const list = r.tickets ?? [];
      const overdue = list.filter((t) => t.overdue).length;
      return [step(tool, "consultou seus chamados", `${list.length} chamado(s)${overdue ? `, ${overdue} vencido(s)` : ""}`)];
    }
    case "get_ticket": {
      const t = r.ticket;
      if (!t) return [step(tool, `consultou o ${a.ticketId ?? "chamado"}`, "sem dados")];
      return [
        step(tool, `consultou o ${t.id}`, t.status),
        step(tool, "calculou o prazo", t.deadline ? `${t.overdue ? "vencido desde" : "até"} ${t.deadline}` : "sem prazo (encerrado)"),
      ];
    }
    case "draft_ticket": {
      if (r.possibleDuplicates?.length) {
        return [step(tool, "verificou duplicidade", `parecido com ${r.possibleDuplicates.map((t) => t.id).join(", ")}`)];
      }
      return [
        step(tool, "verificou duplicidade", "nenhum chamado aberto parecido"),
        step(tool, "classificou a prioridade", `${r.draft?.priority ?? "?"}: ${r.priorityReason ?? ""}`.trim()),
        step(tool, "consultou o prazo", `primeira resposta até ${r.draft?.firstResponseBy ?? "?"}`),
        step(tool, "montou o rascunho", `${r.draftId ?? ""} aguardando confirmação`),
      ];
    }
    case "draft_ticket_update":
      if (r.error === "reopen_not_allowed") return [step(tool, "verificou a reabertura", "fora da janela de 7 dias", false)];
      return [step(tool, a.kind === "reopen" ? "preparou a reabertura" : "preparou o complemento", `${r.ticket?.id ?? a.ticketId} · ${r.draftId} aguardando confirmação`)];
    case "confirm_pending_action": {
      const verb = r.done === "create" ? "abriu o" : r.done === "reopen" ? "reabriu o" : "complementou o";
      return [step(tool, `${verb} ${r.ticket?.id ?? "chamado"}`, "confirmado pelo funcionário")];
    }
    case "cancel_pending_action":
      return [step(tool, "descartou o rascunho", r.discarded ?? "nenhum rascunho pendente")];
    case "handoff_to_analyst":
      return [step(tool, `transferiu para o ${r.team ?? "analista"}`, a.reason ?? "")];
    default:
      return [step(tool, tool, "")];
  }
}
