import { createDb, createTicketsService, migrateDb, seed, type Db } from "@nexo/tickets-service";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NexoAgent } from "../agent/nexo-agent.ts";
import { createConversationEvents } from "../conversations/events.ts";
import { createConversationService } from "../conversations/service.ts";
import { createAppDb, migrateAppDb, type AppDb } from "../db/client.ts";
import { createApp } from "./app.ts";

let ticketsDb: Db;
let appDb: AppDb;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  ticketsDb = createDb(":memory:");
  await migrateDb(ticketsDb);
  await seed(ticketsDb);
  const tickets = createTicketsService({ db: ticketsDb });
  appDb = createAppDb(":memory:");
  await migrateAppDb(appDb);
  const events = createConversationEvents();
  const conversations = createConversationService({ db: appDb, tickets, agent: {} as NexoAgent, model: "test", events });
  app = createApp({
    tickets,
    conversations,
    events,
    sessionSecret: "teste-0123456789abcdef0123456789abcdef",
    secureCookies: false,
    limits: { messagesPer10Min: 20, dailyMessageCap: 500, loginsPerMinute: 10 },
  });
});

afterEach(() => {
  ticketsDb.$client.close();
  appDb.$client.close();
});

async function loginAs(email: string): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "x" }),
  });
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

describe("canal de avisos em tempo real", () => {
  // Regressão: sem no-transform, o proxy do Next compactava o stream com gzip e segurava
  // os eventos no buffer; o navegador só recebia a mensagem do analista ao recarregar.
  it("pede aos proxies para não compactar nem segurar o stream", async () => {
    const cookie = await loginAs("ana.souza@nexo.com.br");
    const controller = new AbortController();
    const res = await app.request("/api/chat/events", { headers: { cookie }, signal: controller.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    controller.abort();
    await res.body?.cancel().catch(() => {});
  });

  it("console de eventos é só para analistas", async () => {
    const cookie = await loginAs("ana.souza@nexo.com.br");
    const res = await app.request("/api/console/events", { headers: { cookie } });
    expect(res.status).toBe(401);
  });
});
