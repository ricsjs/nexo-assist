import { describe, expect, it } from "vitest";
import { describeToolCall } from "./trace.js";

const labels = (tool: string, args: unknown, result: unknown) => describeToolCall(tool, args, result).map((s) => s.label);

describe("describeToolCall", () => {
  it("rascunho vira os passos do protótipo", () => {
    expect(
      labels("draft_ticket", {}, {
        ok: true,
        draftId: "D-381",
        draft: { priority: "Alta", firstResponseBy: "sex., 30/10, 13:43" },
        priorityReason: "reunião às 14h",
      }),
    ).toEqual(["verificou duplicidade", "classificou a prioridade", "consultou o prazo", "montou o rascunho"]);
  });

  it("duplicado encontrado aparece no lugar do rascunho", () => {
    const [s] = describeToolCall("draft_ticket", {}, { ok: true, possibleDuplicates: [{ id: "INC-20311" }] });
    expect(s).toMatchObject({ label: "verificou duplicidade", summary: "parecido com INC-20311" });
  });

  it("consulta resume quantos estão vencidos", () => {
    const [s] = describeToolCall("list_my_tickets", {}, {
      ok: true,
      tickets: [{ id: "A", overdue: true }, { id: "B", overdue: false }],
    });
    expect(s).toMatchObject({ label: "consultou seus chamados", summary: "2 chamado(s), 1 vencido(s)" });
  });

  it("chamado específico inclui o prazo", () => {
    expect(
      labels("get_ticket", {}, { ok: true, ticket: { id: "INC-20311", status: "Aguardando analista", overdue: true, deadline: "qua., 28/10, 18:00" } }),
    ).toEqual(["consultou o INC-20311", "calculou o prazo"]);
  });

  it("falha da ferramenta fica marcada como não ok, com a mensagem", () => {
    const [s] = describeToolCall("confirm_pending_action", {}, { ok: false, error: "not_confirmed_yet", message: "Espere a confirmação." });
    expect(s).toMatchObject({ ok: false, label: "tentou confirmar", summary: "Espere a confirmação." });
  });

  it("confirmação diz o que foi feito", () => {
    expect(labels("confirm_pending_action", {}, { ok: true, done: "create", ticket: { id: "INC-20321" } })).toEqual([
      "abriu o INC-20321",
    ]);
  });
});
