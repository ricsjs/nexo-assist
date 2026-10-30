"use client";

import { HANDOFF_REASON_LABEL, type ConversationSummary } from "@nexo/domain";
import { CheckCheck, Search } from "lucide-react";
import { initials, time } from "@/lib/format";

export type ConsoleFilter = "all" | "for_you" | "with_agent" | "mine";

const FILTERS: { id: ConsoleFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "for_you", label: "Para você" },
  { id: "with_agent", label: "Com o agent" },
  { id: "mine", label: "Minhas" },
];

// Cor estável por pessoa, para o avatar.
const AVATAR = ["bg-blue-100 text-blue-700", "bg-orange-100 text-orange-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-pink-100 text-pink-700", "bg-slate-200 text-slate-700", "bg-amber-100 text-amber-700"];
export function avatarColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length]!;
}

export function Avatar({ id, name, size = "md" }: { id: string; name: string; size?: "md" | "lg" }) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center rounded-full font-semibold ${avatarColor(id)} ${size === "lg" ? "size-11 text-sm" : "size-10 text-xs"}`}>
      {initials(name)}
    </span>
  );
}

interface Props {
  items: ConversationSummary[];
  counts: Record<ConsoleFilter, number> | null;
  filter: ConsoleFilter;
  onFilter: (f: ConsoleFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  analystId: string;
  loading: boolean;
  error: string | null;
}

export function ConversationList({ items, counts, filter, onFilter, query, onQuery, selectedId, onSelect, analystId, loading, error }: Props) {
  return (
    <section className="flex w-[340px] shrink-0 flex-col border-r border-line">
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Conversas</h1>
          <span className="flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
            <span className="size-1.5 rounded-full bg-ok" /> Disponível
          </span>
        </div>
        <label className="mt-4 flex items-center gap-2 rounded-full bg-canvas px-3 py-2 text-sm">
          <Search className="size-4 text-muted" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            className="w-full bg-transparent outline-none"
          />
        </label>
        <div className="mt-3 flex gap-1.5 pb-3">
          {FILTERS.map((f) => {
            const count = counts?.[f.id];
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => onFilter(f.id)}
                className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-brand-soft font-semibold text-brand" : "bg-canvas text-ink-soft hover:bg-line"}`}
              >
                {f.label} {f.id !== "all" && count !== undefined && <span className="ml-0.5">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {error && <li className="px-4 py-3 text-sm text-danger">{error}</li>}
        {!error && loading && items.length === 0 && <li className="px-4 py-3 text-sm text-muted">Carregando conversas…</li>}
        {!loading && items.length === 0 && !error && <li className="px-4 py-6 text-center text-sm text-muted">Nenhuma conversa aqui.</li>}
        {items.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`flex w-full gap-3 border-b border-line px-4 py-3 text-left ${selectedId === c.id ? "bg-brand-soft/60" : "hover:bg-canvas"}`}
            >
              <span className="relative">
                <Avatar id={c.employee.id} name={c.employee.name} />
                {c.status !== "closed" && <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-white bg-ok" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{c.employee.name}</span>
                  <span className={`shrink-0 text-xs ${c.status === "awaiting_analyst" ? "font-semibold text-brand" : "text-muted"}`}>
                    {time(c.updatedAt)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-soft">
                  {c.lastMessage?.role === "agent" && <CheckCheck className="size-3.5 shrink-0 text-brand" />}
                  <span className="truncate">
                    {c.lastMessage?.role === "agent" ? "Nexo: " : ""}
                    {c.lastMessage?.content}
                  </span>
                </span>
                <StatusLine summary={c} analystId={analystId} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// "Transferida · INC-20311", "Agent pediu ajuda · confiança 41%", "Agent atendendo"…
function StatusLine({ summary: c, analystId }: { summary: ConversationSummary; analystId: string }) {
  let tone = "text-ok";
  let dot = "bg-ok";
  let text = "Agent atendendo";

  if (c.status === "closed") {
    [tone, dot, text] = ["text-muted", "bg-gray-400", "Encerrada"];
  } else if (c.status === "with_analyst") {
    [tone, dot, text] = ["text-brand", "bg-brand", c.analystId === analystId ? "Você está atendendo" : `${c.analystName} atendendo`];
  } else if (c.handoffReason === "low_confidence" || (c.status === "with_agent" && c.lowConfidence !== null)) {
    [tone, dot, text] = ["text-warn", "bg-warn", `Agent pediu ajuda · confiança ${Math.round((c.lowConfidence ?? 0) * 100)}%`];
  } else if (c.status === "awaiting_analyst") {
    const detail = c.ticketId ?? (c.handoffReason ? HANDOFF_REASON_LABEL[c.handoffReason] : "");
    [tone, dot, text] = ["text-danger", "bg-danger", `Transferida${detail ? ` · ${detail}` : ""}`];
  }

  return (
    <span className={`mt-1 flex items-center gap-1.5 text-xs ${tone}`}>
      <span className={`size-1.5 rounded-full ${dot}`} /> {text}
    </span>
  );
}
