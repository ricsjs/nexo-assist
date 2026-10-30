import type { TicketDraft } from "@nexo/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, migrateDb, type Db } from "./db/index.js";
import { InvalidDraftError, ReopenNotAllowedError, TicketNotFoundError } from "./errors.js";
import { seed } from "./seed/index.js";
import { createTicketsService, type TicketsService } from "./service.js";

const NOW = new Date("2026-10-30T10:00:00-03:00");
const ANA = "emp-ana";

const vpnDraft: TicketDraft = {
  type: "INC",
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
  category: "network_vpn",
  priority: "high",
  affected: "only_me",
};

let db: Db;
let service: TicketsService;

// Banco novo em memória a cada teste: isolado, rápido e sem arquivo para limpar.
beforeEach(async () => {
  db = createDb(":memory:");
  await migrateDb(db);
  await seed(db, NOW);
  service = createTicketsService({ db, now: () => NOW });
});

afterEach(() => {
  db.$client.close();
});

describe("privacidade", () => {
  it("lista só os chamados do próprio funcionário", async () => {
    const all = await service.listTickets(ANA, "all");
    expect(all).toHaveLength(5);
    expect(all.every((t) => t.requesterId === ANA)).toBe(true);
  });

  it("chamado de outra pessoa responde como se não existisse", async () => {
    // INC-20305 é a VPN do Bruno.
    await expect(service.getTicket(ANA, "INC-20305")).rejects.toThrow(TicketNotFoundError);
    await expect(service.getTicket(ANA, "INC-99999")).rejects.toThrow(TicketNotFoundError);
  });

  it("não deixa complementar nem transferir chamado de outra pessoa", async () => {
    await expect(service.addComment(ANA, "INC-20305", "oi")).rejects.toThrow(TicketNotFoundError);
    await expect(service.transferTicket(ANA, "INC-20305", "N2", "x")).rejects.toThrow(TicketNotFoundError);
  });
});

describe("consulta", () => {
  it("lista abertos do mais recente para o mais antigo", async () => {
    const open = await service.listTickets(ANA);
    expect(open.map((t) => t.id)).toEqual(["INC-20298", "REQ-10442", "INC-20311"]);
  });

  it("lista encerrados separado", async () => {
    const closed = await service.listTickets(ANA, "closed");
    expect(closed.map((t) => t.id)).toEqual(["INC-20150", "INC-19877"]);
  });

  it("traz o chamado com o histórico", async () => {
    const ticket = await service.getTicket(ANA, "INC-20311");
    expect(ticket.title).toBe("Notebook lento após atualização do Windows");
    expect(ticket.history.map((h) => h.authorKind)).toEqual(["system", "employee"]);
  });

  it("encontra funcionário pelo e-mail, ignorando maiúsculas e espaços", async () => {
    expect((await service.findEmployeeByEmail("  Ana.Souza@nexo.com.br "))?.id).toBe(ANA);
    expect(await service.findEmployeeByEmail("ninguem@nexo.com.br")).toBeNull();
  });
});

describe("criação", () => {
  it("cria com o próximo número do tipo e status aguardando analista", async () => {
    const ticket = await service.createTicket(ANA, vpnDraft);
    expect(ticket.id).toBe("INC-20321"); // o maior INC do seed é 20320
    expect(ticket.status).toBe("awaiting_analyst");
    expect(ticket.createdAt).toBe(NOW.toISOString());
    expect((await service.listTickets(ANA)).map((t) => t.id)).toContain("INC-20321");
  });

  it("numera requisições separado dos incidentes", async () => {
    const ticket = await service.createTicket(ANA, { ...vpnDraft, type: "REQ", priority: "low" });
    expect(ticket.id).toBe("REQ-10451");
  });

  it("recusa rascunho sem todos os campos obrigatórios", async () => {
    const { priority: _, ...semPrioridade } = vpnDraft;
    const error = await service.createTicket(ANA, semPrioridade).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidDraftError);
    expect((error as InvalidDraftError).issues[0]).toMatch(/^priority/);
  });

  it("recusa categoria fora da lista", async () => {
    await expect(service.createTicket(ANA, { ...vpnDraft, category: "impressora" })).rejects.toThrow(
      InvalidDraftError,
    );
  });
});

describe("atualização", () => {
  it("complemento entra no histórico sem mexer no prazo", async () => {
    const before = await service.getTicket(ANA, "INC-20311");
    const after = await service.addComment(ANA, "INC-20311", "Agora trava ao abrir o Excel.");
    expect(after.history.at(-1)?.body).toBe("Agora trava ao abrir o Excel.");
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it("reabre chamado resolvido há até 7 dias", async () => {
    const reopened = await service.reopenTicket(ANA, "INC-20150", "A senha bloqueou de novo.");
    expect(reopened.status).toBe("awaiting_analyst");
    expect(reopened.resolvedAt).toBeUndefined();
    expect(reopened.updatedAt).toBe(NOW.toISOString());
  });

  it("não reabre chamado resolvido há mais de 7 dias", async () => {
    await expect(service.reopenTicket(ANA, "INC-19877", "voltou")).rejects.toThrow(ReopenNotAllowedError);
  });

  it("transferência registra o time e o resumo no histórico", async () => {
    const ticket = await service.transferTicket(ANA, "INC-20311", "N2", "Lento há 6 dias, prazo vencido.");
    expect(ticket.history.at(-1)?.body).toContain("Suporte N2");
    expect(ticket.history.at(-1)?.body).toContain("prazo vencido");
  });
});

describe("central de ajuda", () => {
  it("acha o artigo do erro 809", async () => {
    const [first] = await service.searchKnowledge("meu notebook não conecta na VPN, erro 809");
    expect(first?.article.id).toBe("KB-001");
  });

  it("ignora acentos e maiúsculas", async () => {
    const [first] = await service.searchKnowledge("LENTIDAO depois da atualizacao");
    expect(first?.article.id).toBe("KB-005");
  });

  it("não devolve nada quando nenhum artigo tem a ver", async () => {
    expect(await service.searchKnowledge("quero tirar férias em dezembro")).toEqual([]);
  });
});

describe("duplicidade", () => {
  it("aponta chamado aberto da mesma categoria sobre o mesmo assunto", async () => {
    const dups = await service.findPossibleDuplicates(ANA, {
      category: "hardware",
      title: "Notebook muito lento",
      description: "Está lento desde a atualização",
    });
    expect(dups.map((t) => t.id)).toEqual(["INC-20311"]);
  });

  it("VPN da Ana não é duplicada do chamado de VPN do Bruno", async () => {
    expect(await service.findPossibleDuplicates(ANA, vpnDraft)).toEqual([]);
  });

  it("ignora chamados encerrados", async () => {
    const dups = await service.findPossibleDuplicates(ANA, {
      category: "access",
      title: "Senha do SAP bloqueada de novo",
      description: "SAP bloqueou",
    });
    expect(dups).toEqual([]); // INC-20150 está resolvido: reabrir, não duplicar
  });
});

describe("analistas", () => {
  it("encontra analista pelo e-mail", async () => {
    expect(await service.findAnalystByEmail("Rafael.Lima@nexo.com.br")).toMatchObject({ id: "an-rafael", team: "N2" });
    expect(await service.findAnalystByEmail("ana.souza@nexo.com.br")).toBeNull();
  });
});
