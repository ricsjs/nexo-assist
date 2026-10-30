import type { TicketsService, TicketsServiceError } from "@nexo/tickets-service";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { ModelCallError } from "../agent/run-turn.ts";
import { toTicketView } from "../agent/widgets.ts";
import type { ConversationEvents, Topic } from "../conversations/events.ts";
import { ConversationError, type ConsoleFilter, type ConversationService } from "../conversations/service.ts";
import { createAuth, type AuthEnv } from "./auth.ts";
import { createRateLimiter, DAY, MINUTE } from "./rate-limit.ts";

export interface UsageLimits {
  // Mensagens ao agent por funcionário a cada 10 minutos.
  messagesPer10Min: number;
  // Teto de mensagens ao agent por dia na aplicação inteira: limita o custo do deploy público.
  dailyMessageCap: number;
  // Tentativas de login por IP por minuto.
  loginsPerMinute: number;
}

export interface AppDeps {
  tickets: TicketsService;
  conversations: ConversationService;
  sessionSecret: string;
  secureCookies: boolean;
  limits: UsageLimits;
  events: ConversationEvents;
}

// Mensagens longas não ajudam o agent e encarecem cada chamada ao modelo.
const MAX_TEXT = 2000;

const LoginBody = z.object({
  email: z.email(),
  password: z.string().min(1),
  remember: z.boolean().default(true),
});
const TextBody = z.object({ text: z.string().trim().min(1).max(MAX_TEXT) });
const ConsoleQuery = z.object({
  filter: z.enum(["all", "for_you", "with_agent", "mine"]).default("all"),
  q: z.string().default(""),
});

// Erro de domínio → resposta HTTP com mensagem que a tela pode mostrar como está.
function errorResponse(c: Context, error: unknown) {
  if (error instanceof ConversationError) {
    const status = error.code === "not_found" ? 404 : error.code === "message_limit" ? 429 : 409;
    return c.json({ error: error.code, message: error.message }, status);
  }
  if (error instanceof ModelCallError) {
    return c.json({ error: error.kind, message: friendlyModelError(error) }, 503);
  }
  if ((error as TicketsServiceError | null)?.code === "service_unavailable") {
    return c.json({ error: "service_unavailable", message: "O sistema de chamados está instável. Tente de novo em instantes." }, 503);
  }
  console.error(error);
  return c.json({ error: "internal", message: "Algo deu errado do nosso lado. Tente de novo." }, 500);
}

function friendlyModelError(error: ModelCallError): string {
  switch (error.kind) {
    case "rate_limited":
      return "O assistente está com muita demanda agora. Espere um minuto e reenvie sua mensagem.";
    case "timeout":
      return "O assistente demorou demais para responder. Reenvie sua mensagem.";
    default:
      return "Não consegui responder agora. Reenvie sua mensagem.";
  }
}

export function createApp({ tickets, conversations, sessionSecret, secureCookies, limits, events }: AppDeps) {
  const auth = createAuth({ tickets, secret: sessionSecret, secure: secureCookies });
  const loginLimit = createRateLimiter({ limit: limits.loginsPerMinute, windowMs: MINUTE });
  const messageLimit = createRateLimiter({ limit: limits.messagesPer10Min, windowMs: 10 * MINUTE });
  const dailyCap = createRateLimiter({ limit: limits.dailyMessageCap, windowMs: DAY });
  const tooMany = (c: Context, retryAfterMs: number, message: string) => {
    c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return c.json({ error: "rate_limited", message }, 429);
  };
  const app = new Hono<AuthEnv>().basePath("/api");

  app.onError((error, c) => errorResponse(c, error));
  app.get("/health", (c) => c.json({ ok: true }));

  // ---------- autenticação ----------

  app.post("/auth/login", async (c) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const login = loginLimit.hit(ip);
    if (!login.allowed) return tooMany(c, login.retryAfterMs, "Muitas tentativas de login. Espere um minuto.");
    const body = LoginBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid", message: "Informe e-mail e senha." }, 400);
    const user = await auth.login(c, body.data.email, body.data.remember);
    if (!user) return c.json({ error: "invalid_credentials", message: "E-mail não encontrado. Use seu e-mail corporativo." }, 401);
    return c.json(user);
  });

  app.post("/auth/logout", (c) => {
    auth.logout(c);
    return c.json({ ok: true });
  });

  app.get("/auth/me", async (c) => {
    const user = await auth.me(c);
    return user ? c.json(user) : c.json({ error: "unauthorized" }, 401);
  });

  // ---------- chat do funcionário ----------

  // Canal de avisos em tempo real (SSE): "sua conversa mudou". A tela então busca /chat.
  // O ping a cada 15 s mantém a conexão aberta através de proxies.
  const changes = (c: Context, topic: Topic) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = events.subscribe(topic, () => void stream.writeSSE({ event: "changed", data: "{}" }));
      stream.onAbort(unsubscribe);
      await stream.writeSSE({ event: "ready", data: "{}" });
      while (!stream.aborted) {
        await stream.sleep(15_000);
        if (!stream.aborted) await stream.writeSSE({ event: "ping", data: "{}" });
      }
      unsubscribe();
    });

  app.get("/chat/events", auth.requireEmployee, (c) => changes(c, `employee:${c.get("employee").id}`));
  app.get("/console/events", auth.requireAnalyst, (c) => changes(c, "console"));

  app.get("/chat", auth.requireEmployee, async (c) => c.json(await conversations.getChat(c.get("employee"))));

  app.post("/chat/new", auth.requireEmployee, async (c) => c.json(await conversations.startNewChat(c.get("employee"))));

  // Resposta em tempo real (SSE): os passos do agent e o texto chegam conforme acontecem;
  // no fim, "done" traz a conversa salva (com widgets e o registro da decisão).
  app.post("/chat/messages", auth.requireEmployee, async (c) => {
    const body = TextBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid", message: `Mensagem vazia ou acima de ${MAX_TEXT} caracteres.` }, 400);
    const employee = c.get("employee");
    const own = messageLimit.hit(employee.id);
    if (!own.allowed) {
      return tooMany(c, own.retryAfterMs, "Você enviou muitas mensagens seguidas. Espere alguns minutos e tente de novo.");
    }
    const global = dailyCap.hit("all");
    if (!global.allowed) {
      return tooMany(c, global.retryAfterMs, "O assistente atingiu o limite de uso de hoje. Ligue no ramal 4000 se for urgente.");
    }

    return streamSSE(c, async (stream) => {
      try {
        const conversation = await conversations.sendMessage(employee, body.data.text, (event) => {
          if (event.type === "step") void stream.writeSSE({ event: "step", data: JSON.stringify(event.step) });
          if (event.type === "text") void stream.writeSSE({ event: "text", data: JSON.stringify({ text: event.text }) });
        });
        await stream.writeSSE({ event: "done", data: JSON.stringify(conversation) });
      } catch (error) {
        const response = errorResponse(c, error);
        await stream.writeSSE({ event: "error", data: await response.text() });
      }
    });
  });

  // ---------- console do analista ----------

  app.get("/console/conversations", auth.requireAnalyst, async (c) => {
    const query = ConsoleQuery.parse(c.req.query());
    return c.json(await conversations.listForConsole(c.get("analyst"), query.filter as ConsoleFilter, query.q));
  });

  app.get("/console/conversations/:id", auth.requireAnalyst, async (c) => {
    const { conversation, employee } = await conversations.getForConsole(c.req.param("id"));
    // O analista vê os chamados do funcionário (painel "Chamados da Ana").
    const now = new Date();
    const list = await tickets.listTickets(employee.id, "all");
    return c.json({ conversation, employee, tickets: list.map((t) => toTicketView(t, now)) });
  });

  for (const action of ["assume", "return", "close"] as const) {
    app.post(`/console/conversations/:id/${action}`, auth.requireAnalyst, async (c) => {
      const id = c.req.param("id");
      const analyst = c.get("analyst");
      if (action === "assume") await conversations.assume(id, analyst);
      else if (action === "return") await conversations.returnToAgent(id, analyst);
      else await conversations.close(id, analyst);
      return c.json({ ok: true });
    });
  }

  app.post("/console/conversations/:id/messages", auth.requireAnalyst, async (c) => {
    const body = TextBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid", message: "Mensagem vazia ou longa demais." }, 400);
    await conversations.sendAnalystMessage(c.req.param("id"), c.get("analyst"), body.data.text);
    return c.json({ ok: true });
  });

  return app;
}
