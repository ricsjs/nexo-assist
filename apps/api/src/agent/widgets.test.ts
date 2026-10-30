import type { Decision, TicketView, Widget } from "@nexo/domain";
import { describe, expect, it } from "vitest";
import { selectWidgets, type WidgetCandidate } from "./widgets.js";

const ticket = (id: string) => ({ id }) as TicketView;
const list = (...ids: string[]): Widget => ({ type: "ticket_list", tickets: ids.map(ticket) });
const decision = (intent: Decision["intent"], options?: string[]): Decision => ({
  understood: "",
  intent,
  action: "",
  confidence: 0.9,
  reason: "",
  ...(options && { options }),
});

describe("selectWidgets", () => {
  it("mostra a lista para escolher quando a consulta tem mais de um chamado", () => {
    const out = selectWidgets([{ source: "list", widget: list("A", "B") }], decision("ticket_status"));
    expect(out.map((w) => w.type)).toEqual(["ticket_list"]);
  });

  it("esconde a lista usada só para checar duplicidade numa abertura", () => {
    expect(selectWidgets([{ source: "list", widget: list("A", "B") }], decision("new_ticket"))).toEqual([]);
  });

  it("com um chamado escolhido, mostra só o card", () => {
    const candidates: WidgetCandidate[] = [
      { source: "list", widget: list("A", "B") },
      { source: "ticket", widget: { type: "ticket_card", ticket: ticket("A") } },
    ];
    expect(selectWidgets(candidates, decision("ticket_status")).map((w) => w.type)).toEqual(["ticket_card"]);
  });

  it("opções rápidas vêm da decisão, mas não junto do rascunho (que já tem botões)", () => {
    expect(selectWidgets([], decision("new_ticket", ["Só eu", "Minha equipe"]))).toEqual([
      { type: "quick_replies", options: ["Só eu", "Minha equipe"] },
    ]);
    const draft: Widget = { type: "draft", draft: { draftId: "D-1", kind: "create", title: "t", description: "d" } };
    expect(selectWidgets([{ source: "draft", widget: draft }], decision("new_ticket", ["Sim"]))).toEqual([draft]);
  });
});
