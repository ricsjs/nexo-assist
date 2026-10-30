"use client";

import type { MessageView, TraceStep } from "@nexo/domain";
import { ArrowLeftRight, Headset } from "lucide-react";
import { ActionChips, DecisionDetails, DecisionToggle, useDecisionToggle } from "@/components/decision";
import { time } from "@/lib/format";
import { RichText } from "./rich-text";
import { WidgetView, type WidgetActions } from "./widgets";

// Mensagens do chat do funcionário (Telas 2 e 3).

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-lg rounded-xl bg-ink px-4 py-3 text-sm whitespace-pre-wrap text-white">{text}</p>
    </div>
  );
}

export function AgentMessage({ message, actions }: { message: MessageView; actions: WidgetActions }) {
  const { open, toggle } = useDecisionToggle();
  return (
    <div className="max-w-2xl space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-ink">Nexo Assist</span>
        {message.trace && <ActionChips steps={message.trace.steps} />}
        {message.trace && <DecisionToggle open={open} onToggle={toggle} />}
      </p>
      {open && message.trace && <DecisionDetails trace={message.trace} />}
      <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm leading-relaxed">
        <RichText text={message.content} />
      </div>
      {message.widgets.map((w, i) => (
        <WidgetView key={i} widget={w} actions={actions} />
      ))}
    </div>
  );
}

// Resposta sendo escrita: as ações aparecem conforme o agent as executa, antes do texto.
export function StreamingAgentMessage({ steps, text }: { steps: TraceStep[]; text: string }) {
  return (
    <div className="max-w-2xl space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-ink">Nexo Assist</span>
        <ActionChips steps={steps} />
      </p>
      <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm leading-relaxed">
        {text ? (
          <div className="typing-caret">
            <RichText text={text} />
          </div>
        ) : (
          <span className="text-muted">{steps.length ? "Analisando…" : "Pensando…"}</span>
        )}
      </div>
    </div>
  );
}

export function AnalystMessage({ message }: { message: MessageView }) {
  return (
    <div className="max-w-2xl space-y-2">
      <p className="flex items-center gap-2 text-xs">
        <Headset className="size-3.5 text-ok" />
        <span className="font-semibold">{message.authorName}</span>
        {message.authorTeam && <span className="rounded bg-ok-soft px-1.5 py-0.5 text-ok">{message.authorTeam}</span>}
        <span className="text-muted">{time(message.createdAt)}</span>
      </p>
      <div className="rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 text-sm">
        <RichText text={message.content} />
      </div>
    </div>
  );
}

export function EventLine({ message }: { message: MessageView }) {
  return (
    <p className="flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-line" />
      <ArrowLeftRight className="size-3.5" /> {message.content} · {time(message.createdAt)}
      <span className="h-px flex-1 bg-line" />
    </p>
  );
}
