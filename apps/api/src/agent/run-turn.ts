import { RequestContext } from "@mastra/core/request-context";
import { MAX_STEPS_PER_MESSAGE, type NexoAgent } from "./nexo-agent.js";
import type { AgentSession, NexoRequestContext } from "./session.js";

type StreamOutput = Awaited<ReturnType<NexoAgent["stream"]>>;
type ResponseMessage = NonNullable<Awaited<StreamOutput["response"]>["messages"]>[number];

// O histórico guarda as chamadas de ferramenta e os resultados, não só o texto: sem isso,
// na mensagem seguinte o modelo não "lembra", por exemplo, do draftId do rascunho que mostrou.
export type ChatMessage = { role: "user"; content: string } | ResponseMessage;

export type TurnEvent =
  | { type: "tool-call"; toolName: string; args: unknown }
  | { type: "tool-result"; toolName: string; result: unknown }
  | { type: "text"; text: string };

// Falha ao falar com o provedor do LLM. rateLimited separa "espere e tente de novo"
// (cota do plano, 429) de erros que não melhoram com nova tentativa.
export class ModelCallError extends Error {
  readonly rateLimited: boolean;
  constructor(override readonly cause: unknown) {
    const status = (cause as { statusCode?: number } | null)?.statusCode;
    super(status === 429 ? "Limite de uso do modelo atingido." : "Falha ao falar com o modelo.");
    this.name = "ModelCallError";
    this.rateLimited = status === 429;
  }
}

export type TurnResult =
  | { status: "answered"; text: string }
  // Conversa com analista: o agent não responde (Anexo A, "Transferência").
  | { status: "paused" };

// Processa uma mensagem do funcionário: avança o turno, roda o agent com a sessão
// no requestContext e repassa os eventos (ferramentas e texto) conforme chegam.
export async function runTurn(
  agent: NexoAgent,
  session: AgentSession,
  history: ChatMessage[],
  text: string,
  onEvent: (event: TurnEvent) => void = () => {},
): Promise<TurnResult> {
  if (session.handoff) return { status: "paused" };

  const turnStart = history.length;
  session.turn++;
  history.push({ role: "user", content: text });
  const requestContext = new RequestContext<NexoRequestContext>([["session", session]]);
  try {
    const result = await agent.stream(history, { requestContext, maxSteps: MAX_STEPS_PER_MESSAGE });
    let answer = "";
    for await (const chunk of result.fullStream) {
      if (chunk.type === "tool-call") {
        onEvent({ type: "tool-call", toolName: chunk.payload.toolName, args: chunk.payload.args });
      } else if (chunk.type === "tool-result") {
        onEvent({ type: "tool-result", toolName: chunk.payload.toolName, result: chunk.payload.result });
      } else if (chunk.type === "text-delta") {
        answer += chunk.payload.text;
        onEvent({ type: "text", text: chunk.payload.text });
      } else if (chunk.type === "error") {
        // O Mastra entrega a falha do provedor como evento, sem lançar: sem isto, a conversa
        // seguiria com uma resposta vazia no histórico.
        throw new ModelCallError(chunk.payload.error);
      }
    }
    history.push(...((await result.response).messages ?? [{ role: "assistant", content: answer }]));
    return { status: "answered", text: answer };
  } catch (error) {
    // Desfaz a mensagem para o funcionário poder reenviar sem bagunçar o histórico.
    history.length = turnStart;
    session.turn--;
    throw error;
  }
}
