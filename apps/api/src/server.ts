import { serve } from "@hono/node-server";
import { createNexoAgent } from "./agent/nexo-agent.ts";
import { loadConfig } from "./config.ts";
import { createConversationService } from "./conversations/service.ts";
import { createAppDb, migrateAppDb } from "./db/client.ts";
import { createApp } from "./http/app.ts";
import { createTicketsClient } from "./services/tickets.ts";

// Ponto de entrada do api: monta as dependências em camadas e sobe o HTTP.
const config = (() => {
  try {
    return loadConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();

const tickets = await createTicketsClient({
  outageRate: config.TICKETS_OUTAGE_RATE,
  outageMs: config.TICKETS_OUTAGE_MS,
  retry: { onRetry: ({ operation, attempt }) => console.warn(`[legado] ${operation} indisponível, tentativa ${attempt + 1}`) },
});
const db = createAppDb();
await migrateAppDb(db);

const conversations = createConversationService({
  db,
  tickets,
  agent: createNexoAgent(config.LLM_MODEL, tickets),
  model: config.LLM_MODEL,
});

const app = createApp({
  tickets,
  conversations,
  sessionSecret: config.SESSION_SECRET,
  secureCookies: config.NODE_ENV === "production",
});

serve({ fetch: app.fetch, port: config.PORT }, ({ port }) => {
  console.log(`Nexo Assist api em http://localhost:${port} · modelo ${config.LLM_MODEL}`);
});
