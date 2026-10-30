import { MAX_MESSAGES_PER_SESSION, type Analyst, type Employee } from "@nexo/domain";
import { createDb, createTicketsService, migrateDb, seed, type Db } from "@nexo/tickets-service";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NexoAgent } from "../agent/nexo-agent.js";
import { createAppDb, migrateAppDb, schema, type AppDb } from "../db/client.js";
import { ConversationError, createConversationService, type ConversationService } from "./service.js";

// Agent que acusa erro se for chamado: prova que, com analista, o agent não responde.
const agentThatMustNotRun = {
  stream: () => {
    throw new Error("o agent não deveria ter sido chamado");
  },
} as unknown as NexoAgent;

let ticketsDb: Db;
let appDb: AppDb;
let service: ConversationService;
let ana: Employee;
let rafael: Analyst;
let juliana: Analyst;

beforeEach(async () => {
  ticketsDb = createDb(":memory:");
  await migrateDb(ticketsDb);
  await seed(ticketsDb);
  const tickets = createTicketsService({ db: ticketsDb });
  appDb = createAppDb(":memory:");
  await migrateAppDb(appDb);
  service = createConversationService({ db: appDb, tickets, agent: agentThatMustNotRun, model: "test" });
  ana = (await tickets.findEmployeeByEmail("ana.souza@nexo.com.br"))!;
  rafael = (await tickets.findAnalystByEmail("rafael.lima@nexo.com.br"))!;
  juliana = (await tickets.findAnalystByEmail("juliana.costa@nexo.com.br"))!;
});

afterEach(() => {
  ticketsDb.$client.close();
  appDb.$client.close();
});

// Simula o fim de um turno em que o agent transferiu a conversa.
async function transferred(id: string) {
  await appDb
    .update(schema.conversations)
    .set({ status: "awaiting_analyst", handoff: { reason: "overdue_ticket", team: "N2", summary: "Notebook lento há 6 dias", ticketId: "INC-20311" } })
    .where(eq(schema.conversations.id, id));
  await appDb.insert(schema.messages).values({ conversationId: id, role: "user", content: "Quero um analista", createdAt: new Date().toISOString() });
}

describe("chat do funcionário", () => {
  it("volta para a mesma conversa em aberto", async () => {
    const first = await service.getChat(ana);
    expect((await service.getChat(ana)).id).toBe(first.id);
  });

  it("com a conversa transferida, a mensagem fica para o analista e o agent não responde", async () => {
    const conv = await service.getChat(ana);
    await transferred(conv.id);
    const after = await service.sendMessage(ana, "Está parado há 5 dias.");
    expect(after.status).toBe("awaiting_analyst");
    expect(after.messages.at(-1)).toMatchObject({ role: "user", content: "Está parado há 5 dias." });
    expect(after.userMessages).toBe(1);
  });

  it("bloqueia depois do limite de mensagens e permite começar outra conversa", async () => {
    const conv = await service.getChat(ana);
    await appDb
      .update(schema.conversations)
      .set({ userMessages: MAX_MESSAGES_PER_SESSION })
      .where(eq(schema.conversations.id, conv.id));
    await expect(service.sendMessage(ana, "oi")).rejects.toMatchObject({ code: "message_limit" });
    const fresh = await service.startNewChat(ana);
    expect(fresh.id).not.toBe(conv.id);
    expect(fresh.userMessages).toBe(0);
  });
});

describe("console do analista", () => {
  it("lista a conversa transferida em 'Para você'", async () => {
    const conv = await service.getChat(ana);
    await transferred(conv.id);
    const { items, counts } = await service.listForConsole(rafael, "for_you");
    expect(items.map((i) => i.id)).toEqual([conv.id]);
    expect(items[0]).toMatchObject({ handoffReason: "overdue_ticket", ticketId: "INC-20311" });
    expect(counts).toMatchObject({ for_you: 1, with_agent: 0, mine: 0 });
  });

  it("assumir pausa o agent; só quem assumiu responde; devolver limpa a transferência", async () => {
    const conv = await service.getChat(ana);
    await transferred(conv.id);

    await expect(service.sendAnalystMessage(conv.id, rafael, "Oi")).rejects.toBeInstanceOf(ConversationError);
    await service.assume(conv.id, rafael);
    await expect(service.assume(conv.id, juliana)).rejects.toMatchObject({ code: "invalid_state" });
    await service.sendAnalystMessage(conv.id, rafael, "Oi, Ana! Aqui é o Rafael.");

    let detail = (await service.getForConsole(conv.id)).conversation;
    expect(detail).toMatchObject({ status: "with_analyst", analystName: "Rafael Lima" });
    expect(detail.messages.map((m) => m.role)).toEqual(["user", "event", "analyst"]);

    await service.returnToAgent(conv.id, rafael);
    detail = (await service.getForConsole(conv.id)).conversation;
    expect(detail).toMatchObject({ status: "with_agent", handoff: null, analystName: null });
  });

  it("encerrar fecha a conversa e o funcionário começa outra na próxima visita", async () => {
    const conv = await service.getChat(ana);
    await transferred(conv.id);
    await service.close(conv.id, rafael);
    expect((await service.getChat(ana)).id).not.toBe(conv.id);
  });
});
