"use client";

import { HANDOFF_REASON_LABEL, PRIORITY_RULES, type ConversationView, type Employee, type TicketView } from "@nexo/domain";
import { ArrowLeftRight, ChevronRight, Headset, X } from "lucide-react";
import { categoryLabel, StatusLabel } from "@/components/ticket-bits";
import { shortDate, time } from "@/lib/format";

// Painel "Chamados da Ana" (Telas 4 e 5): o chamado desta conversa, o resumo que o agent
// deixou na transferência e os outros chamados do funcionário.
export function TicketsPanel({
  employee,
  tickets,
  conversation,
  onClose,
}: {
  employee: Employee;
  tickets: TicketView[];
  conversation: ConversationView;
  onClose: () => void;
}) {
  const firstName = employee.name.split(" ")[0];
  const open = tickets.filter((t) => !["resolved", "cancelled"].includes(t.status));
  const ticketId = conversation.handoff?.ticketId;
  const current = tickets.find((t) => t.id === ticketId);
  const others = tickets.filter((t) => t.id !== ticketId);
  const handoffEvent = conversation.messages.findLast((m) => m.role === "event" && m.content.startsWith("Transferida"));
  const assumedEvent = conversation.messages.findLast((m) => m.role === "event" && m.content.includes("assumiu"));

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-line">
      <header className="flex items-start justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="font-semibold">Chamados da {firstName}</h2>
          <p className="text-xs text-muted">
            {open.length} abertos · {tickets.length - open.length} encerrados
          </p>
        </div>
        <button onClick={onClose} aria-label="Fechar painel" className="text-muted hover:text-ink">
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {conversation.handoff && (
          <section>
            <h3 className="text-xs font-medium text-muted">Desta conversa</h3>
            <div className="mt-2 rounded-xl bg-canvas p-4">
              {current ? (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">{current.id}</span>
                    <StatusLabel status={conversation.status === "with_analyst" ? "in_progress" : current.status} strong />
                  </div>
                  <p className="mt-1 font-semibold">{current.title}</p>
                  <p className="text-xs text-muted">
                    {categoryLabel(current)} · prioridade {PRIORITY_RULES[current.priority].label.toLowerCase()}
                    {current.overdue && <span className="text-warn"> · prazo vencido</span>}
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold">{HANDOFF_REASON_LABEL[conversation.handoff.reason]}</p>
              )}
              <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">
                <span className="font-medium text-ink">Resumo do agent:</span> {conversation.handoff.summary}
              </p>
              <p className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-soft">
                {conversation.status === "with_analyst" && assumedEvent ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <Headset className="size-3.5" /> Assumido por {conversation.analystName}
                    </span>
                    {time(assumedEvent.createdAt)}
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <ArrowLeftRight className="size-3.5" /> Transferido para o {conversation.handoff.team}
                    </span>
                    {handoffEvent && time(handoffEvent.createdAt)}
                  </>
                )}
              </p>
            </div>
          </section>
        )}

        <section>
          <h3 className="text-xs font-medium text-muted">{conversation.handoff ? "Outros chamados" : "Chamados"}</h3>
          <ul className="mt-2 divide-y divide-line">
            {others.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    {t.id} ·{" "}
                    {t.resolvedAt ? `Resolvido em ${shortDate(t.resolvedAt)}` : <StatusLabel status={t.status} />}
                    {t.overdue && <span className="text-warn"> · vencido</span>}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted" />
              </li>
            ))}
            {others.length === 0 && <li className="py-3 text-sm text-muted">Nenhum outro chamado.</li>}
          </ul>
        </section>
      </div>
    </aside>
  );
}
