import type { ConversationView, TraceStep } from "@nexo/domain";

// Cliente do api. Tudo passa por /api (proxy do Next), com o cookie de sessão httpOnly.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function parseError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  return new ApiError(res.status, body?.error ?? "error", body?.message ?? "Não foi possível falar com o servidor.");
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
      headers: init?.body === undefined ? {} : { "content-type": "application/json" },
      body: init?.body === undefined ? null : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Sem conexão com o servidor. Verifique sua internet.");
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export interface StreamHandlers {
  onStep: (step: TraceStep) => void;
  onText: (text: string) => void;
}

// Envia a mensagem e lê a resposta em tempo real (SSE sobre o corpo do POST).
export async function sendChatMessage(text: string, handlers: StreamHandlers): Promise<ConversationView> {
  let res: Response;
  try {
    res = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new ApiError(0, "network", "Sem conexão com o servidor. Verifique sua internet.");
  }
  if (!res.ok || !res.body) throw await parseError(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    // Eventos SSE terminam com uma linha em branco.
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: ?(.*)$/m.exec(raw)?.[1]?.trim();
      const data = raw
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.replace(/^data: ?/, ""))
        .join("\n");
      if (!event || !data) continue;
      const payload: unknown = JSON.parse(data);
      if (event === "step") handlers.onStep(payload as TraceStep);
      else if (event === "text") handlers.onText((payload as { text: string }).text);
      else if (event === "done") return payload as ConversationView;
      else if (event === "error") {
        const e = payload as { error?: string; message?: string };
        throw new ApiError(500, e.error ?? "error", e.message ?? "Não consegui responder agora.");
      }
    }
  }
  throw new ApiError(500, "incomplete", "A resposta foi interrompida. Reenvie sua mensagem.");
}
