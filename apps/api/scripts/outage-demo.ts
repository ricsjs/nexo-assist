import { createTicketsClient } from "../src/services/tickets.js";

// Demonstração: com o legado bem instável, as chamadas ainda dão certo por causa do retry.
const tickets = await createTicketsClient({
  outageRate: Number(process.env.TICKETS_OUTAGE_RATE ?? 0.3),
  outageMs: Number(process.env.TICKETS_OUTAGE_MS ?? 1000),
  retry: {
    onRetry: ({ operation, attempt, delayMs }) =>
      console.log(`  ↻ ${operation}: sistema fora, tentativa ${attempt + 1} em ${delayMs}ms`),
  },
});

for (let i = 1; i <= 5; i++) {
  const started = Date.now();
  const open = await tickets.listTickets("emp-ana");
  console.log(`consulta ${i}: ${open.length} chamados abertos (${Date.now() - started}ms)`);
}
