import { RequestContext } from "@mastra/core/request-context";
import type { TraceStep, TurnTrace, Widget } from "@nexo/domain";
import { MAX_STEPS_PER_MESSAGE, type NexoAgent } from "./nexo-agent.ts";
import type { AgentSession, NexoRequestContext } from "./session.ts";
import { describeToolCall } from "./trace.ts";
import { selectWidgets } from "./widgets.ts";

type StreamOutput = Awaited<ReturnType<NexoAgent["stream"]>>;
type ResponseMessage = NonNullable<Awaited<StreamOutput["response"]>["messages"]>[number];

// O histórico guarda as chamadas de ferramenta e os resultados, não só o texto: sem isso,
// na mensagem seguinte o modelo não "lembra", por exemplo, do draftId do rascunho que mostrou.
export type ChatMessage = { role: "user"; content: string } | ResponseMessage;

export type TurnEvent =
  | { type: "tool-call"; toolName: string; args: unknown }
  | { type: "tool-result"; toolName: string; result: unknown }
  | { type: "step"; step: TraceStep }
  | { type: "text"; text: string };

// Falha ao falar com o provedor do LLM. O tipo separa "espere e tente de novo"
// (cota do plano, 429) de demora excessiva, resposta vazia e erro do provedor.
export type ModelFailure = "rate_limited" | "timeout" | "empty_answer" | "provider_error";

const FAILURE_MESSAGE: Record<ModelFailure, string> = {
  rate_limited: "Limite de uso do modelo atingido.",
  timeout: "O modelo demorou demais para responder.",
  empty_answer: "O modelo não devolveu resposta.",
  provider_error: "Falha ao falar com o modelo.",
};

export class ModelCallError extends Error {
  constructor(
    readonly kind: ModelFailure,
    override readonly cause?: unknown,
  ) {
    super(FAILURE_MESSAGE[kind]);
    this.name = "ModelCallError";
  }

  get rateLimited(): boolean {
    return this.kind === "rate_limited";
  }

  static fromProvider(cause: unknown): ModelCallError {
    const status = (cause as { statusCode?: number } | null)?.statusCode;
    return new ModelCallError(status === 429 ? "rate_limited" : "provider_error", cause);
  }
}

// Tempo máximo de uma mensagem inteira, incluindo as idas e voltas com as ferramentas.
export const TURN_TIMEOUT_MS = 60_000;

export type TurnResult =
  | { status: "answered"; text: string; trace: TurnTrace; widgets: Widget[]; newMessages: ChatMessage[] }
  // Conversa com analista: o agent não responde (Anexo A, "Transferência").
  | { status: "paused" };

// Processa uma mensagem do funcionário: avança o turno, roda o agent com a sessão
// no requestContext e repassa os eventos (ferramentas e texto) conforme chegam.
export interface RunTurnInput {
  agent: NexoAgent;
  // Só para o registro: qual modelo respondeu.
  model: string;
  session: AgentSession;
  history: ChatMessage[];
  text: string;
  onEvent?: (event: TurnEvent) => void;
}

export async function runTurn({ agent, model, session, history, text, onEvent = () => {} }: RunTurnInput): Promise<TurnResult> {
  if (session.handoff) return { status: "paused" };

  const turnStart = history.length;
  session.turn++;
  session.decision = null;
  session.widgets = [];
  const startedAt = Date.now();
  const steps: TraceStep[] = [];
  history.push({ role: "user", content: text });
  const requestContext = new RequestContext<NexoRequestContext>([["session", session]]);
  try {
    // Sem limite, um provedor que não responde deixaria o chat carregando para sempre.
    const abortSignal = AbortSignal.timeout(TURN_TIMEOUT_MS);
    const result = await agent.stream(history, { requestContext, maxSteps: MAX_STEPS_PER_MESSAGE, abortSignal });
    let answer = "";
    let finish: unknown;
    for await (const chunk of result.fullStream) {
      if (chunk.type === "tool-call") {
        onEvent({ type: "tool-call", toolName: chunk.payload.toolName, args: chunk.payload.args });
      } else if (chunk.type === "tool-result") {
        onEvent({ type: "tool-result", toolName: chunk.payload.toolName, result: chunk.payload.result });
        // record_decision é a declaração do modelo, não uma ação: vai para trace.decision.
        if (chunk.payload.toolName !== "record_decision") {
          for (const s of describeToolCall(chunk.payload.toolName, chunk.payload.args, chunk.payload.result)) {
            steps.push(s);
            onEvent({ type: "step", step: s });
          }
        }
      } else if (chunk.type === "text-delta") {
        answer += chunk.payload.text;
        onEvent({ type: "text", text: chunk.payload.text });
      } else if (chunk.type === "error") {
        // O Mastra entrega falhas como eventos, sem lançar: sem isto, a conversa
        // seguiria com uma resposta vazia no histórico.
        throw ModelCallError.fromProvider(chunk.payload.error);
      } else if (chunk.type === "abort") {
        throw new ModelCallError("timeout");
      } else if (chunk.type === "finish") {
        finish = chunk.payload.stepResult;
      }
    }
    if (answer.trim() === "") throw new ModelCallError("empty_answer", finish);
    const newMessages: ChatMessage[] = (await result.response).messages ?? [{ role: "assistant", content: answer }];
    history.push(...newMessages);
    const usage = await result.totalUsage;
    const trace: TurnTrace = {
      turn: session.turn,
      decision: session.decision,
      steps,
      model,
      durationMs: Date.now() - startedAt,
      tokens: usage ? { input: usage.inputTokens ?? 0, output: usage.outputTokens ?? 0 } : null,
    };
    return { status: "answered", text: answer, trace, widgets: selectWidgets(session.widgets, session.decision), newMessages };
  } catch (error) {
    // Desfaz a mensagem para o funcionário poder reenviar sem bagunçar o histórico.
    history.length = turnStart;
    session.turn--;
    throw error;
  }
}
