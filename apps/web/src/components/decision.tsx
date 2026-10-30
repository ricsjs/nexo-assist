"use client";

import { INTENT_LABEL, LOW_CONFIDENCE, type TraceStep, type TurnTrace } from "@nexo/domain";
import { Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";

// Transparência (PRD, item 7): as ações acima de cada resposta e, ao expandir,
// o que o agent entendeu, que ação tomou, com que segurança e por quê.

export function ActionChips({ steps }: { steps: TraceStep[] }) {
  return (
    <>
      {steps.map((s, i) => (
        <span key={`${s.label}-${i}`} className={`inline-flex items-center gap-1 ${s.ok ? "text-muted" : "text-danger"}`}>
          {s.ok ? <Check className="size-3" /> : <X className="size-3" />}
          {s.label}
        </span>
      ))}
    </>
  );
}

export function DecisionToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="inline-flex items-center gap-0.5 font-medium text-brand hover:underline" aria-expanded={open}>
      {open ? "ocultar decisão" : "ver decisão"}
      <ChevronDown className={`size-3 transition ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

export function useDecisionToggle() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((v) => !v) };
}

export function DecisionDetails({ trace }: { trace: TurnTrace }) {
  const d = trace.decision;
  return (
    <div className="rounded-xl border border-line bg-canvas p-4 text-sm">
      {d ? (
        <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Entendeu</dt>
          <dd>
            {d.understood} <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-xs text-muted">{INTENT_LABEL[d.intent]}</span>
          </dd>
          <dt className="text-muted">Ação</dt>
          <dd>{d.action}</dd>
          <dt className="text-muted">Segurança</dt>
          <dd>
            <Confidence value={d.confidence} />
          </dd>
          <dt className="text-muted">Por quê</dt>
          <dd>{d.reason}</dd>
        </dl>
      ) : (
        <p className="text-muted">O agent não registrou a interpretação nesta resposta.</p>
      )}

      {trace.steps.length > 0 && (
        <ol className="mt-4 space-y-1.5 border-t border-line pt-3">
          {trace.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              {s.ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <X className="mt-0.5 size-3.5 shrink-0 text-danger" />}
              <span>
                <span className="font-medium">{s.label}</span>
                {s.summary && <span className="text-muted"> — {s.summary}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-3 text-xs text-muted">
        {trace.model} · {(trace.durationMs / 1000).toFixed(1)} s
        {trace.tokens && ` · ${trace.tokens.input.toLocaleString("pt-BR")} + ${trace.tokens.output.toLocaleString("pt-BR")} tokens`}
      </p>
    </div>
  );
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const low = value < LOW_CONFIDENCE;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white">
        <span className={`block h-full rounded-full ${low ? "bg-warn" : "bg-ok"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={low ? "font-medium text-warn" : ""}>
        {pct}%{low && " · baixa, pediu um analista"}
      </span>
    </span>
  );
}
