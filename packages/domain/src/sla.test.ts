import { describe, expect, it } from "vitest";
import { canReopen, isOverdue, slaDeadline, ticketDeadline } from "./sla.js";
import type { Priority } from "./ticket.js";

// Datas escritas no horário de Brasília. 30/10/2026 é uma sexta-feira.
const at = (local: string) => new Date(`${local}-03:00`);
const iso = (local: string) => at(local).toISOString();

describe("slaDeadline", () => {
  it.each<[string, Priority, string, string]>([
    // [caso, prioridade, abertura, prazo esperado]
    ["alta no meio do expediente (Tela 2)", "high", "2026-10-30T09:43", "2026-10-30T13:43"],
    ["alta terminando exatamente às 18h", "high", "2026-10-26T14:00", "2026-10-26T18:00"],
    ["alta atravessando o fim de semana", "high", "2026-10-30T16:00", "2026-11-02T10:00"],
    ["alta aberta no sábado começa segunda 8h", "high", "2026-10-31T11:00", "2026-11-02T12:00"],
    ["alta aberta antes das 8h começa às 8h", "high", "2026-10-27T06:30", "2026-10-27T12:00"],
    ["alta aberta depois das 18h começa no dia seguinte", "high", "2026-10-26T19:00", "2026-10-27T12:00"],
    ["média: 3 dias úteis pulando o fim de semana", "medium", "2026-10-29T10:00", "2026-11-03T10:00"],
    ["baixa: 5 dias úteis desde antes do expediente", "low", "2026-10-26T07:00", "2026-10-30T18:00"],
    ["crítica conta horas corridas, mesmo no fim de semana", "critical", "2026-10-31T23:30", "2026-11-01T00:30"],
  ])("%s", (_caso, priority, opened, expected) => {
    expect(slaDeadline(priority, at(opened)).toISOString()).toBe(iso(expected));
  });
});

describe("ticketDeadline", () => {
  it("conta a partir da última atualização", () => {
    const deadline = ticketDeadline({
      priority: "high",
      status: "in_progress",
      updatedAt: iso("2026-10-30T09:43"),
    });
    expect(deadline?.toISOString()).toBe(iso("2026-10-30T13:43"));
  });

  it.each(["resolved", "cancelled"] as const)("chamado %s não tem prazo", (status) => {
    expect(ticketDeadline({ priority: "high", status, updatedAt: iso("2026-10-30T09:00") })).toBeNull();
  });
});

describe("isOverdue", () => {
  // Média aberta quinta 10h vence terça 10h.
  const ticket = { priority: "medium", status: "awaiting_analyst", updatedAt: iso("2026-10-29T10:00") } as const;

  it("não está vencido no instante exato do prazo", () => {
    expect(isOverdue(ticket, at("2026-11-03T10:00"))).toBe(false);
  });

  it("está vencido um minuto depois do prazo", () => {
    expect(isOverdue(ticket, at("2026-11-03T10:01"))).toBe(true);
  });

  it("INC-20311: média sem atualização há 6 dias está vencido", () => {
    expect(isOverdue({ ...ticket, updatedAt: iso("2026-10-24T10:00") }, at("2026-10-30T10:00"))).toBe(true);
  });

  it("chamado resolvido nunca está vencido", () => {
    expect(isOverdue({ ...ticket, status: "resolved" }, at("2027-01-01T10:00"))).toBe(false);
  });
});

describe("canReopen", () => {
  const now = at("2026-10-30T10:00");
  const resolved = (local: string) => ({ status: "resolved", resolvedAt: iso(local) }) as const;

  it("INC-20150: resolvido há 4 dias pode ser reaberto", () => {
    expect(canReopen(resolved("2026-10-26T10:00"), now)).toBe(true);
  });

  it("resolvido há exatamente 7 dias ainda pode", () => {
    expect(canReopen(resolved("2026-10-23T10:00"), now)).toBe(true);
  });

  it("resolvido há 7 dias e 1 minuto não pode", () => {
    expect(canReopen(resolved("2026-10-23T09:59"), now)).toBe(false);
  });

  it("chamado que não está resolvido não é reaberto", () => {
    expect(canReopen({ status: "in_progress", resolvedAt: iso("2026-10-29T10:00") }, now)).toBe(false);
  });

  it("chamado resolvido sem data de resolução não é reaberto", () => {
    expect(canReopen({ status: "resolved" }, now)).toBe(false);
  });
});
