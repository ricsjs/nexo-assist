"use client";

import type { ConversationSummary, ConversationView as Conversation, Employee, TicketView } from "@nexo/domain";
import { LogOut, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationList, type ConsoleFilter } from "@/components/console/conversation-list";
import { ConversationView } from "@/components/console/conversation-view";
import { TicketsPanel } from "@/components/console/tickets-panel";
import { api, ApiError } from "@/lib/api";
import { initials } from "@/lib/format";
import { useLiveUpdates } from "@/lib/live-updates";
import { logout, SessionGate, useSessionUser } from "@/lib/session";

interface Detail {
  conversation: Conversation;
  employee: Employee;
  tickets: TicketView[];
}

export default function ConsolePage() {
  return (
    <SessionGate kind="analyst">
      <Console />
    </SessionGate>
  );
}

function Console() {
  const analyst = useSessionUser();
  const router = useRouter();
  const [filter, setFilter] = useState<ConsoleFilter>("for_you");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<{ items: ConversationSummary[]; counts: Record<ConsoleFilter, number> } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams({ filter, q: query });
      const data = await api<{ items: ConversationSummary[]; counts: Record<ConsoleFilter, number> }>(`/console/conversations?${params}`);
      setList(data);
      setListError(null);
      // Abre a primeira conversa da lista quando nada está selecionado.
      setSelectedId((id) => id ?? data.items[0]?.id ?? null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Não foi possível carregar as conversas.");
    }
  }, [filter, query]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api<Detail>(`/console/conversations/${id}`));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Não foi possível abrir a conversa.");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    setActionError(null);
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Tempo real: qualquer conversa que mudar (transferência nova, mensagem da funcionária,
  // outro analista assumindo) avisa o console, que recarrega a lista e a conversa aberta.
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  useLiveUpdates("/api/console/events", () => {
    void loadList();
    if (selectedRef.current) void loadDetail(selectedRef.current);
  });

  // Assumir, devolver, encerrar: chama o api e recarrega lista e conversa.
  async function act(path: string, body: unknown = {}): Promise<boolean> {
    if (!selectedId) return false;
    setBusy(true);
    setActionError(null);
    try {
      await api(`/console/conversations/${selectedId}/${path}`, { body });
      await Promise.all([loadDetail(selectedId), loadList()]);
      return true;
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "A ação não foi concluída. Tente de novo.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const current = detail && detail.conversation.id === selectedId ? detail : null;

  return (
    <div className="flex h-screen">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-4 border-r border-line py-5">
        <img src="/logo-mark.png" alt="Nexo" width={28} height={28} />
        <span className="relative mt-4 flex size-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-line">
          <MessageSquare className="size-5 text-ink-soft" />
          {list && list.counts.for_you > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
              {list.counts.for_you}
            </span>
          )}
        </span>
        <div className="mt-auto flex flex-col items-center gap-3">
          <button onClick={() => logout(router)} aria-label="Sair" className="text-muted hover:text-ink">
            <LogOut className="size-4" />
          </button>
          <span className="relative flex size-9 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand" title={analyst.name}>
            {initials(analyst.name)}
            <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-white bg-ok" />
          </span>
        </div>
      </nav>

      <ConversationList
        items={list?.items ?? []}
        counts={list?.counts ?? null}
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        selectedId={selectedId}
        onSelect={setSelectedId}
        analystId={analyst.id}
        loading={!list}
        error={listError}
      />

      {current ? (
        <>
          <ConversationView
            conversation={current.conversation}
            employee={current.employee}
            analystId={analyst.id}
            busy={busy}
            error={actionError}
            showPanel={showPanel}
            onTogglePanel={() => setShowPanel((v) => !v)}
            onAssume={() => void act("assume")}
            onReturn={() => void act("return")}
            onClose={() => void act("close")}
            onSend={(text) => act("messages", { text })}
          />
          {showPanel && (
            <TicketsPanel
              employee={current.employee}
              tickets={current.tickets}
              conversation={current.conversation}
              onClose={() => setShowPanel(false)}
            />
          )}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center bg-canvas text-sm text-muted">
          {selectedId ? (actionError ?? "Carregando conversa…") : "Selecione uma conversa"}
        </div>
      )}
    </div>
  );
}
