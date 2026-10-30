import {
  createDb,
  createTicketsService,
  migrateDb,
  seedIfEmpty,
  withSimulatedOutages,
  type TicketsService,
} from "@nexo/tickets-service";
import { DEFAULT_RETRY, withRetry, type RetryOptions } from "../lib/retry.ts";

export interface TicketsClientOptions {
  // Instabilidade simulada do legado; 0 desliga.
  outageRate: number;
  outageMs: number;
  retry?: Partial<RetryOptions>;
}

// Monta o serviço de chamados do jeito que o agent vai usar, em camadas:
// serviço real → instabilidade simulada (o "legado") → retry com backoff.
export async function createTicketsClient(options: TicketsClientOptions): Promise<TicketsService> {
  const db = createDb();
  await migrateDb(db);
  if (await seedIfEmpty(db)) console.log("Banco de chamados vazio: dados de exemplo criados.");
  const legacy = withSimulatedOutages(createTicketsService({ db }), {
    outageRate: options.outageRate,
    outageMs: options.outageMs,
  });
  return withRetry(legacy, { ...DEFAULT_RETRY, ...options.retry });
}
