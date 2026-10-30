"use client";

import type { ConversationView as Conversation, Employee, MessageView } from "@nexo/domain";
import { ArrowLeftRight, Bot, CircleCheck, Hand, Headset, PanelRight, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DecisionDetails, DecisionToggle, useDecisionToggle } from "@/components/decision";
import { RichText } from "@/components/chat/rich-text";
import { time } from "@/lib/format";
import { Avatar } from "./conversation-list";

interface Props {
  conversation: Conversation;
  employee: Employee;
  analystId: string;
  busy: boolean;
  error: string | null;
  showPanel: boolean;
  onTogglePanel: () => void;
  onAssume: () => void;
  onReturn: () => void;
  onClose: () => void;
  onSend: (text: string) => Promise<boolean>;
}

// Telas 4 e 5: conversa transferida (agent pausado) e analista atendendo.
export function ConversationView(props: Props) {
  const { conversation: c, employee, busy, error } = props;
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstName = employee.name.split(" ")[0];
  const mine = c.status === "with_analyst" && c.analystId === props.analystId;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [c.messages.length]);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-5">
        <Avatar id={employee.id} name={employee.name} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{employee.name}</p>
          <p className="truncate text-xs text-muted">
            online · {employee.department}
            {c.handoff?.ticketId && ` · ${c.handoff.ticketId}`}
          </p>
        </div>
        {mine ? (
          <>
            <button
              onClick={props.onReturn}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50"
            >
              <Bot className="size-4" /> Devolver ao agent
            </button>
            <button
              onClick={props.onClose}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              <CircleCheck className="size-4" /> Encerrar atendimento
            </button>
          </>
        ) : (
          <StatusBadge conversation={c} />
        )}
        <button onClick={props.onTogglePanel} aria-label="Chamados do funcionário" className={`ml-1 rounded-lg p-2 ${props.showPanel ? "bg-canvas" : ""} hover:bg-canvas`}>
          <PanelRight className="size-4 text-muted" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto bg-canvas px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <p className="mx-auto w-fit rounded-full bg-white px-3 py-1 text-xs text-muted shadow-sm">Histórico da conversa</p>
          {c.messages.map((m) => (
            <ConsoleMessage key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && <p className="border-t border-danger/20 bg-danger-soft px-5 py-2 text-sm text-danger">{error}</p>}

      <footer className="shrink-0 border-t border-line">
        {mine ? (
          <Composer onSend={props.onSend} disabled={busy} />
        ) : (
          <>
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-warn-soft">
                {c.status === "with_agent" ? <Bot className="size-4 text-ok" /> : <Hand className="size-4 text-warn" />}
              </span>
              <div className="flex-1 text-sm">
                <p className="font-semibold">
                  {c.status === "awaiting_analyst" && `${firstName} espera um atendente`}
                  {c.status === "with_agent" && "O agent está atendendo"}
                  {c.status === "with_analyst" && `${c.analystName} está atendendo`}
                  {c.status === "closed" && "Conversa encerrada"}
                </p>
                <p className="text-xs text-muted">
                  {c.status === "awaiting_analyst" && "Agent pausado"}
                  {c.status === "with_agent" && "Você pode assumir se precisar intervir"}
                </p>
              </div>
              {c.status === "awaiting_analyst" && (
                <button onClick={props.onReturn} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50">
                  <Bot className="size-4" /> Devolver ao agent
                </button>
              )}
              {(c.status === "awaiting_analyst" || c.status === "with_agent") && (
                <button onClick={props.onAssume} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                  <Headset className="size-4" /> Assumir atendimento
                </button>
              )}
            </div>
            {c.status !== "closed" && (
              <p className="mx-5 mb-3 rounded-lg bg-canvas px-4 py-3 text-sm text-muted">Assuma o atendimento para responder</p>
            )}
          </>
        )}
      </footer>
    </section>
  );
}

function StatusBadge({ conversation: c }: { conversation: Conversation }) {
  if (c.status === "awaiting_analyst") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-xs font-semibold text-warn">
        <Bot className="size-3.5" /> Aguardando atendente
      </span>
    );
  }
  if (c.status === "with_agent") {
    return <span className="rounded-full bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">Agent atendendo</span>;
  }
  if (c.status === "with_analyst") {
    return <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">{c.analystName} atendendo</span>;
  }
  return <span className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold text-muted">Encerrada</span>;
}

function ConsoleMessage({ message: m }: { message: MessageView }) {
  const { open, toggle } = useDecisionToggle();

  if (m.role === "event") {
    return (
      <p className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        <ArrowLeftRight className="size-3.5" /> {m.content} · {time(m.createdAt)}
        <span className="h-px flex-1 bg-line" />
      </p>
    );
  }

  if (m.role === "user") {
    return (
      <div className="flex">
        <div className="max-w-md rounded-xl bg-white px-4 py-2.5 text-sm shadow-sm">
          <span className="whitespace-pre-wrap">{m.content}</span>
          <span className="ml-3 text-[11px] text-muted">{time(m.createdAt)}</span>
        </div>
      </div>
    );
  }

  const agent = m.role === "agent";
  return (
    <div className="ml-auto max-w-lg space-y-1">
      <p className="flex items-center justify-end gap-2 text-xs">
        {agent && m.trace && <DecisionToggle open={open} onToggle={toggle} />}
        <span className="font-semibold">{agent ? "Nexo Assist" : m.authorName}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${agent ? "bg-brand-soft text-brand" : "bg-ok-soft text-ok"}`}>
          {agent ? "IA" : m.authorTeam}
        </span>
      </p>
      {open && m.trace && <DecisionDetails trace={m.trace} />}
      <div className={`rounded-xl px-4 py-2.5 text-sm ${agent ? "bg-brand-soft" : "border border-ok/20 bg-ok-soft"}`}>
        <RichText text={m.content} />
        <p className="mt-1 text-right text-[11px] text-muted">{time(m.createdAt)}</p>
      </div>
    </div>
  );
}

function Composer({ onSend, disabled }: { onSend: (text: string) => Promise<boolean>; disabled: boolean }) {
  const [text, setText] = useState("");
  async function submit() {
    if (!text.trim() || disabled) return;
    if (await onSend(text.trim())) setText("");
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex items-center gap-3 px-5 py-3"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escreva para o funcionário…"
        maxLength={2000}
        className="flex-1 rounded-xl bg-canvas px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand/20"
        autoFocus
      />
      <button type="submit" disabled={disabled || !text.trim()} aria-label="Enviar" className="flex size-11 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-dark disabled:opacity-50">
        <Send className="size-4" />
      </button>
    </form>
  );
}
