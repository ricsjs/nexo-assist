// Porta de entrada do serviço de chamados: só o que está aqui pode ser usado de fora.
export { createDb, migrateDb, type Db } from "./db/index.ts";
export { seed, seedIfEmpty } from "./seed/index.ts";
export { createTicketsService, type TicketsService, type TicketFilter, type TicketWithHistory } from "./service.ts";
export type { TicketUpdate } from "./mappers.ts";
export type { KbMatch } from "./knowledge.ts";
export { withSimulatedOutages, type OutageOptions } from "./outages.ts";
export * from "./errors.ts";
