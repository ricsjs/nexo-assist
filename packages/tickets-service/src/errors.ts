// Erros com código, para quem chama o serviço (o agent) saber o que aconteceu
// e explicar ao funcionário sem depender do texto da mensagem.
export type TicketsErrorCode = "ticket_not_found" | "employee_not_found" | "invalid_draft" | "reopen_not_allowed";

export class TicketsServiceError extends Error {
  constructor(
    readonly code: TicketsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TicketsServiceError";
  }
}

export class TicketNotFoundError extends TicketsServiceError {
  // Mesma resposta para "não existe" e "é de outra pessoa": não confirmamos
  // nem a existência de chamados alheios (Anexo A, "Privacidade").
  constructor(ticketId: string) {
    super("ticket_not_found", `Chamado ${ticketId} não encontrado.`);
  }
}

export class EmployeeNotFoundError extends TicketsServiceError {
  constructor(employeeId: string) {
    super("employee_not_found", `Funcionário ${employeeId} não encontrado.`);
  }
}

export class InvalidDraftError extends TicketsServiceError {
  constructor(readonly issues: string[]) {
    super("invalid_draft", `Rascunho incompleto ou inválido: ${issues.join("; ")}`);
  }
}

export class ReopenNotAllowedError extends TicketsServiceError {
  constructor(ticketId: string) {
    super("reopen_not_allowed", `${ticketId} só pode ser reaberto se foi resolvido há até 7 dias.`);
  }
}
