import { createDb, migrateDb, seed } from "@nexo/tickets-service";
import { createNexoAgent } from "../src/agent/nexo-agent.js";
import { ModelCallError, runTurn, type ChatMessage } from "../src/agent/run-turn.js";
import { createSession } from "../src/agent/session.js";
import { loadConfig } from "../src/config.js";
import { createTicketsClient } from "../src/services/tickets.js";

// Roda conversas roteirizadas contra o modelo de verdade e mostra o que o agent decidiu.
// Não é teste automático (o LLM varia e custa), é a conferência manual das decisões.
// Uso: pnpm --filter @nexo/api scenarios [nome]

const SCENARIOS: Record<string, string[]> = {
  "duvida-central": ["Qual o horário de atendimento do service desk?"],
  "consulta-status": ["Qual o status do meu chamado?", "O do notebook lento"],
  "abrir-chamado": [
    "Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.",
    "Só eu. Uso Windows 11 e tenho reunião com um cliente às 14h, preciso da VPN.",
    "Pode criar",
  ],
  "fora-do-escopo": ["Como faço para ver meu holerite?"],
  privacidade: ["Qual o status do INC-20305?"],
  transferencia: ["Quero falar com um analista sobre meu notebook lento, já faz quase uma semana."],
};

const config = loadConfig();

// Planos gratuitos limitam requisições por minuto. Ao bater no limite, espera e repete a
// mensagem (o runTurn desfaz a tentativa que falhou, então o histórico fica limpo).
async function withQuotaWait<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof ModelCallError && error.rateLimited) || i >= attempts) throw error;
      console.log("  [limite de requisições do modelo: aguardando 30s]");
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
}
const only = process.argv[2];
const names = only ? [only] : Object.keys(SCENARIOS);

// Banco recriado antes de cada cenário: um não interfere no outro.
const db = createDb();
await migrateDb(db);
const tickets = await createTicketsClient({ outageRate: 0, outageMs: 1 });
const agent = createNexoAgent(config.LLM_MODEL, tickets);

for (const name of names) {
  const messages = SCENARIOS[name];
  if (!messages) throw new Error(`Cenário desconhecido: ${name}`);
  await seed(db);
  const employee = await tickets.findEmployeeByEmail("ana.souza@nexo.com.br");
  if (!employee) throw new Error("Seed sem a Ana: confira packages/tickets-service/src/seed/data.ts");
  const session = createSession(employee);
  const history: ChatMessage[] = [];

  console.log(`\n=== ${name} ===`);
  for (const text of messages) {
    console.log(`\nfuncionário › ${text}`);
    try {
      const result = await withQuotaWait(() =>
        runTurn(agent, session, history, text, (event) => {
          if (event.type === "tool-call") console.log(`  · ${event.toolName} ${JSON.stringify(event.args ?? {})}`);
        }),
      );
      console.log(result.status === "paused" ? "  [agent pausado: conversa com analista]" : `nexo › ${result.text}`);
    } catch (error) {
      if (!(error instanceof ModelCallError)) throw error;
      const reason = (error.cause as { reason?: string; rawReason?: string } | undefined) ?? {};
      console.log(`  [falhou: ${error.kind}${reason.reason ? ` (${reason.reason} ${reason.rawReason ?? ""})` : ""}]`);
      break;
    }
  }
}
