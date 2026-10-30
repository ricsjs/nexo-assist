// Porta de entrada do serviço de chamados: só o que está aqui pode ser usado de fora.
export { createDb, migrateDb, type Db } from "./db/index.js";
export { seed } from "./seed/index.js";
export { createTicketsService, type TicketsService, type TicketFilter, type TicketWithHistory } from "./service.js";
export type { TicketUpdate } from "./mappers.js";
export type { KbMatch } from "./knowledge.js";
export * from "./errors.js";
