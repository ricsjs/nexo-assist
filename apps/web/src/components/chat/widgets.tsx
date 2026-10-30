"use client";

import { AFFECTED_LABEL, CATEGORY_LABEL, type DraftView, type TicketView, type Widget } from "@nexo/domain";
import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";
import { categoryLabel, PriorityLabel, StatusLabel } from "@/components/ticket-bits";
import { dateTime, deadlineLabel, relative, shortDate } from "@/lib/format";

export interface WidgetActions {
  // Envia uma mensagem como se o funcionário tivesse digitado (seleção, confirmação, opção rápida).
  send: (text: string) => void;
  // Coloca um texto no campo de mensagem para o funcionário completar (Editar rascunho).
  prefill: (text: string) => void;
  disabled: boolean;
  pendingDraftId: string | null;
  isLatest: boolean;
}

export function WidgetView({ widget, actions }: { widget: Widget; actions: WidgetActions }) {
  switch (widget.type) {
    case "ticket_list":
      return <TicketPicker tickets={widget.tickets} actions={actions} />;
    case "ticket_card":
      return <TicketCard ticket={widget.ticket} note={widget.note} />;
    case "draft":
      return <DraftCard draft={widget.draft} actions={actions} />;
    case "quick_replies":
      return actions.isLatest ? <QuickReplies options={widget.options} actions={actions} /> : null;
  }
}

// Tela 3: seleção entre os chamados abertos. Escolher envia "INC-20311 · Título".
function TicketPicker({ tickets, actions }: { tickets: TicketView[]; actions: WidgetActions }) {
  const interactive = actions.isLatest && !actions.disabled;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      {tickets.map((t) => (
        <button
          key={t.id}
          disabled={!interactive}
          onClick={() => actions.send(`${t.id} · ${t.title}`)}
          className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left text-sm last:border-b-0 enabled:hover:bg-canvas disabled:cursor-default"
        >
          <span className="size-4 shrink-0 rounded-full border-2 border-gray-300" />
          <span className="w-20 shrink-0 text-xs text-muted">{t.id}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
          {t.overdue && <span className="text-xs font-medium text-warn">vencido</span>}
          <StatusLabel status={t.status} />
          <span className="w-12 text-right text-xs text-muted">{shortDate(t.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

export function TicketCard({ ticket, note }: { ticket: TicketView; note?: string | undefined }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {note ? <span className="font-semibold text-ok">{note}</span> : "Chamado"} · {ticket.id}
        </span>
        <StatusLabel status={ticket.status} strong />
      </div>
      <h3 className="mt-2 text-lg font-semibold">{ticket.title}</h3>
      <p className="mt-1 text-sm text-ink-soft">{ticket.description}</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-3 text-sm sm:grid-cols-4">
        <Field label="Categoria">{categoryLabel(ticket)}</Field>
        <Field label="Prioridade">
          <PriorityLabel priority={ticket.priority} />
        </Field>
        <Field label="Aberto em">{dateTime(ticket.createdAt)}</Field>
        <Field label="Última atualização">
          <span className={ticket.overdue ? "text-warn" : ""}>{relative(ticket.updatedAt)}</span>
          {ticket.overdue && <span className="text-xs text-muted"> · prazo vencido</span>}
          {!ticket.overdue && ticket.deadline && (
            <span className="block text-xs text-muted">prazo {deadlineLabel(ticket.deadline)}</span>
          )}
        </Field>
      </dl>
    </div>
  );
}

// Tela 2: rascunho para conferir. Confirmar e Cancelar viram mensagens do funcionário, então a
// confirmação passa pela mesma regra do agent (só executa em mensagem posterior ao rascunho).
function DraftCard({ draft, actions }: { draft: DraftView; actions: WidgetActions }) {
  const pending = actions.pendingDraftId === draft.draftId;
  const interactive = pending && actions.isLatest && !actions.disabled;
  const kindLabel = draft.kind === "create" ? "Novo chamado" : draft.kind === "reopen" ? `Reabrir ${draft.ticketId}` : `Complementar ${draft.ticketId}`;

  useEffect(() => {
    if (!interactive) return;
    // ⌘↵ / Ctrl+↵ confirma, como no protótipo.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        actions.send("Confirmar");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interactive, actions]);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">
            {kindLabel} · Rascunho {draft.draftId}
          </span>
          {pending ? (
            <span className="flex items-center gap-1.5 font-medium text-warn">
              <span className="size-1.5 rounded-full bg-warn" /> Aguardando confirmação
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted">
              <CheckCircle2 className="size-3.5" /> Rascunho encerrado
            </span>
          )}
        </div>
        <h3 className="mt-2 text-lg font-semibold">{draft.title}</h3>
        <p className="mt-1 text-sm text-ink-soft">{draft.description}</p>
        {draft.kind === "create" && draft.category && draft.priority && draft.affected && (
          <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-line pt-3 text-sm">
            <Field label="Categoria">{CATEGORY_LABEL[draft.category]}</Field>
            <Field label="Prioridade">
              <PriorityLabel priority={draft.priority} />
              {draft.firstResponseBy && (
                <span className="text-xs text-muted"> · resposta até {deadlineLabel(draft.firstResponseBy)}</span>
              )}
            </Field>
            <Field label="Afetados">{AFFECTED_LABEL[draft.affected]}</Field>
          </dl>
        )}
      </div>
      {interactive && (
        <div className="flex items-center gap-2 border-t border-line bg-canvas px-4 py-3">
          <button
            onClick={() => actions.send("Confirmar")}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Confirmar <kbd className="rounded bg-white/20 px-1.5 text-[10px]">⌘↵</kbd>
          </button>
          <button
            onClick={() => actions.prefill("Quero alterar o rascunho: ")}
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-canvas"
          >
            Editar
          </button>
          <button onClick={() => actions.send("Cancelar o rascunho")} className="px-3 py-2 text-sm text-muted hover:text-ink">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function QuickReplies({ options, actions }: { options: string[]; actions: WidgetActions }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          disabled={actions.disabled}
          onClick={() => actions.send(o)}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-brand hover:bg-brand-soft hover:text-brand disabled:opacity-50"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
