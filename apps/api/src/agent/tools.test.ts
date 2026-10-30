import { RequestContext } from "@mastra/core/request-context";
import { createDb, createTicketsService, migrateDb, seed, type Db } from "@nexo/tickets-service";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSession, type AgentSession, type NexoRequestContext } from "./session.js";
import { createNexoTools, teamFor, type NexoTools } from "./tools.js";

// As ferramentas são chamadas direto, como o modelo faria, sem LLM: testa as garantias em código.
const NOW = new Date("2026-10-30T10:00:00-03:00");

let db: Db;
let tools: NexoTools;
let session: AgentSession;
let ctx: { requestContext: RequestContext<NexoRequestContext> };

// execute existe em toda ferramenta criada com createTool; o "!" só convence o compilador.
type AnyTool = { execute?: (input: never, context: never) => Promise<unknown> };
const run = (tool: AnyTool, input: object) =>
  tool.execute!(input as never, ctx as never) as Promise<Record<string, unknown> & { ok: boolean }>;

const vpnDraft = {
  type: "INC",
  title: "VPN não conecta — erro 809",
  description: "Desde ontem o notebook (Windows 11) não conecta na VPN, erro 809.",
  category: "network_vpn",
  priority: "high",
  affected: "only_me",
  priorityReason: "Reunião com cliente hoje às 14h",
  ignoreDuplicates: false,
};

beforeEach(async () => {
  db = createDb(":memory:");
  await migrateDb(db);
  await seed(db, NOW);
  const service = createTicketsService({ db, now: () => NOW });
  tools = createNexoTools(service);
  const ana = await service.findEmployeeByEmail("ana.souza@nexo.com.br");
  session = createSession(ana!, () => NOW);
  session.turn = 1; // o funcionário mandou a primeira mensagem
  ctx = { requestContext: new RequestContext<NexoRequestContext>([["session", session]]) };
});

afterEach(() => db.$client.close());

describe("consulta", () => {
  it("lista só os chamados da Ana e marca o vencido", async () => {
    const result = await run(tools.list_my_tickets, { status: "open" });
    const list = result.tickets as { id: string; overdue: boolean }[];
    expect(list.map((t) => t.id)).toEqual(["INC-20298", "REQ-10442", "INC-20311"]);
    expect(list.find((t) => t.id === "INC-20311")?.overdue).toBe(true);
  });

  it("chamado de outra pessoa volta como não encontrado", async () => {
    const result = await run(tools.get_ticket, { ticketId: "INC-20305" });
    expect(result).toMatchObject({ ok: false, error: "ticket_not_found" });
  });
});

describe("abertura com confirmação", () => {
  it("rascunho não cria chamado e não pode ser confirmado no mesmo turno", async () => {
    const draft = await run(tools.draft_ticket, vpnDraft);
    expect(draft).toMatchObject({ ok: true, created: false });

    const sameTurn = await run(tools.confirm_pending_action, { draftId: draft.draftId });
    expect(sameTurn).toMatchObject({ ok: false, error: "not_confirmed_yet" });
    expect((await run(tools.list_my_tickets, { status: "open" })).tickets).toHaveLength(3);
  });

  it("cria depois que o funcionário responde", async () => {
    const draft = await run(tools.draft_ticket, vpnDraft);
    session.turn++; // "pode criar"
    const done = await run(tools.confirm_pending_action, { draftId: draft.draftId });
    expect(done).toMatchObject({ ok: true, done: "create", ticket: { id: "INC-20321", priority: "Alta" } });
    expect(session.pendingAction).toBeNull();
  });

  it("recusa confirmar um rascunho diferente do pendente", async () => {
    await run(tools.draft_ticket, vpnDraft);
    session.turn++;
    expect(await run(tools.confirm_pending_action, { draftId: "D-000" })).toMatchObject({ error: "draft_mismatch" });
  });

  it("aponta duplicado em vez de montar rascunho", async () => {
    const result = await run(tools.draft_ticket, {
      ...vpnDraft,
      title: "Notebook lento",
      description: "Lento desde a atualização do Windows",
      category: "hardware",
      priority: "medium",
    });
    expect(result.draftId).toBeUndefined();
    expect((result.possibleDuplicates as { id: string }[])[0]?.id).toBe("INC-20311");
    expect(session.pendingAction).toBeNull();
  });
});

describe("atualização", () => {
  it("não prepara reabertura fora da janela de 7 dias", async () => {
    const result = await run(tools.draft_ticket_update, { ticketId: "INC-19877", kind: "reopen", text: "voltou" });
    expect(result).toMatchObject({ error: "reopen_not_allowed" });
    expect(session.pendingAction).toBeNull();
  });

  it("complementa depois da confirmação", async () => {
    const draft = await run(tools.draft_ticket_update, { ticketId: "inc-20311", kind: "comment", text: "Agora trava o Excel." });
    session.turn++;
    expect(await run(tools.confirm_pending_action, { draftId: draft.draftId })).toMatchObject({ ok: true, done: "comment" });
  });
});

describe("transferência", () => {
  it("chamado vencido vai para o N2 com o resumo no histórico", async () => {
    const result = await run(tools.handoff_to_analyst, {
      reason: "overdue_ticket",
      summary: "Notebook lento há 6 dias, prazo de 3 dias úteis vencido.",
      ticketId: "INC-20311",
    });
    expect(result).toMatchObject({ ok: true, team: "Suporte N2" });
    expect(session.handoff).toMatchObject({ team: "N2", ticketId: "INC-20311" });
  });

  it("pedido do funcionário começa no N1", () => {
    expect(teamFor("user_request")).toBe("N1");
    expect(teamFor("critical")).toBe("N2");
  });
});
