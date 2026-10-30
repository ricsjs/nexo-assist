"use client";

import type { ConversationView, TraceStep } from "@nexo/domain";
import { ArrowUp, Headset, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentMessage, AnalystMessage, EventLine, StreamingAgentMessage, UserBubble } from "@/components/chat/messages";
import type { WidgetActions } from "@/components/chat/widgets";
import { PageHeader, StatusPill } from "@/components/page-header";
import { api, ApiError, sendChatMessage } from "@/lib/api";
import { useSessionUser } from "@/lib/session";

// Enquanto a conversa está com um analista, a tela busca mensagens novas de tempos em tempos.
const POLL_MS = 4000;

const SUGGESTIONS = [
  "Qual o status do meu chamado?",
  "Minha VPN não conecta",
  "Preciso de acesso a um sistema",
  "Qual o horário do service desk?",
];

interface Streaming {
  text: string;
  steps: TraceStep[];
  answer: string;
}

export default function ChatPage() {
  const user = useSessionUser();
  const [conversation, setConversation] = useState<ConversationView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [error, setError] = useState<{ message: string; retry: string } | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setConversation(await api<ConversationView>("/chat"));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Não foi possível carregar a conversa.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Com analista: atualiza sozinha para mostrar as respostas dele.
  useEffect(() => {
    if (!conversation || conversation.status === "with_agent" || streaming) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [conversation, streaming, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation?.messages.length, streaming?.answer, streaming?.steps.length, error]);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || streaming) return;
      setError(null);
      setDraft("");
      setStreaming({ text: clean, steps: [], answer: "" });
      try {
        const updated = await sendChatMessage(clean, {
          onStep: (step) => setStreaming((s) => s && { ...s, steps: [...s.steps, step] }),
          onText: (chunk) => setStreaming((s) => s && { ...s, answer: s.answer + chunk }),
        });
        setConversation(updated);
      } catch (err) {
        setError({ message: err instanceof ApiError ? err.message : "Não consegui enviar agora.", retry: clean });
      } finally {
        setStreaming(null);
        inputRef.current?.focus();
      }
    },
    [streaming],
  );

  const lastAgentId = useMemo(
    () => conversation?.messages.filter((m) => m.role === "agent").at(-1)?.id ?? null,
    [conversation],
  );

  if (loadError && !conversation) {
    return (
      <Centered>
        <p className="text-sm text-danger">{loadError}</p>
        <button onClick={() => void load()} className="mt-3 text-sm font-semibold text-brand">
          Tentar de novo
        </button>
      </Centered>
    );
  }
  if (!conversation) return <Centered>Carregando conversa…</Centered>;

  const limitReached = conversation.userMessages >= conversation.messageLimit;
  const withHuman = conversation.status !== "with_agent";
  const baseActions: Omit<WidgetActions, "isLatest"> = {
    send: (t) => void send(t),
    prefill: (t) => {
      setDraft(t);
      inputRef.current?.focus();
    },
    disabled: Boolean(streaming) || limitReached || withHuman,
    pendingDraftId: conversation.pendingDraftId,
  };

  return (
    <>
      <PageHeader title="Atendimento" status={<ChatStatus conversation={conversation} />} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
          {conversation.messages.length === 0 && !streaming && (
            <Welcome name={user.name.split(" ")[0] ?? user.name} onPick={(t) => void send(t)} />
          )}

          {conversation.messages.map((m) => {
            if (m.role === "user") return <UserBubble key={m.id} text={m.content} />;
            if (m.role === "agent") return <AgentMessage key={m.id} message={m} actions={{ ...baseActions, isLatest: m.id === lastAgentId }} />;
            if (m.role === "analyst") return <AnalystMessage key={m.id} message={m} />;
            return <EventLine key={m.id} message={m} />;
          })}

          {streaming && (
            <>
              <UserBubble text={streaming.text} />
              {!withHuman && <StreamingAgentMessage steps={streaming.steps} text={streaming.answer} />}
            </>
          )}

          {withHuman && <HandoffBanner conversation={conversation} />}

          {error && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
              <span>{error.message}</span>
              <button
                onClick={() => void send(error.retry)}
                className="flex shrink-0 items-center gap-1.5 font-semibold hover:underline"
              >
                <RotateCcw className="size-3.5" /> Tentar de novo
              </button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="shrink-0 px-6 pb-4">
        <div className="mx-auto max-w-3xl">
          {limitReached ? (
            <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
              <span>Esta conversa chegou ao limite de {conversation.messageLimit} mensagens.</span>
              <button
                onClick={async () => setConversation(await api<ConversationView>("/chat/new", { body: {} }))}
                className="font-semibold text-brand hover:underline"
              >
                Começar nova conversa
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
              className="flex items-end gap-2 rounded-xl border border-line bg-white p-2 shadow-sm focus-within:border-brand"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={2000}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                placeholder={withHuman ? "Escreva para o analista…" : "Escreva para o Nexo…"}
                className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || Boolean(streaming)}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                <ArrowUp className="size-4" /> Enviar
              </button>
            </form>
          )}
          <p className="mt-2 text-right text-xs text-muted">
            {conversation.userMessages}/{conversation.messageLimit} mensagens nesta sessão
          </p>
        </div>
      </footer>
    </>
  );
}

function ChatStatus({ conversation }: { conversation: ConversationView }) {
  if (conversation.status === "awaiting_analyst") return <StatusPill tone="warn">Aguardando atendente</StatusPill>;
  if (conversation.status === "with_analyst") {
    return <StatusPill tone="info">{conversation.analystName ?? "Analista"} está atendendo</StatusPill>;
  }
  return <StatusPill tone="ok">Assistente online</StatusPill>;
}

function HandoffBanner({ conversation }: { conversation: ConversationView }) {
  const waiting = conversation.status === "awaiting_analyst";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
      <Headset className="mt-0.5 size-4 shrink-0 text-brand" />
      <p>
        {waiting
          ? `Sua conversa foi encaminhada ao ${conversation.handoff?.team ?? "service desk"}. Um analista vai continuar por aqui; enquanto isso, o assistente fica pausado.`
          : `${conversation.analystName ?? "Um analista"} está com você nesta conversa.`}
      </p>
    </div>
  );
}

function Welcome({ name, onPick }: { name: string; onPick: (text: string) => void }) {
  return (
    <div className="py-10 text-center">
      <Sparkles className="mx-auto size-6 text-brand" />
      <h1 className="mt-3 font-serif text-3xl">Olá, {name}. Como posso ajudar?</h1>
      <p className="mt-2 text-sm text-muted">Descreva o problema com suas palavras. Eu consulto seus chamados e a central de ajuda.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onPick(s)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brand hover:text-brand">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center text-sm text-muted">{children}</div>;
}
