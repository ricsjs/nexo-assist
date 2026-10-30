import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { createNexoAgent } from "../src/agent/nexo-agent.js";
import { ModelCallError, runTurn, type ChatMessage } from "../src/agent/run-turn.js";
import { createSession } from "../src/agent/session.js";
import { loadConfig, type Config } from "../src/config.js";
import { createTicketsClient } from "../src/services/tickets.js";

// Chat de terminal enquanto a interface não existe.
// Uso: pnpm chat [email]   (padrão: ana.souza@nexo.com.br)
// O histórico fica só na memória deste processo; persistência vem depois.

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const tickets = await createTicketsClient({
  outageRate: config.TICKETS_OUTAGE_RATE,
  outageMs: config.TICKETS_OUTAGE_MS,
  retry: { onRetry: ({ operation, attempt }) => console.log(`  ↻ ${operation}: sistema instável, tentativa ${attempt + 1}`) },
});

const email = process.argv[2] ?? "ana.souza@nexo.com.br";
const employee = await tickets.findEmployeeByEmail(email);
if (!employee) {
  console.error(`Funcionário ${email} não encontrado. Rode "pnpm db:seed" para criar os dados de exemplo.`);
  process.exit(1);
}

const agent = createNexoAgent(config.LLM_MODEL, tickets);
const session = createSession(employee);
const history: ChatMessage[] = [];
const rl = createInterface({ input: stdin, output: stdout });

console.log(`Nexo Assist (${config.LLM_MODEL}) · logado como ${employee.name}. Digite "sair" para encerrar.\n`);

for (;;) {
  const text = (await rl.question("você › ")).trim();
  if (text === "") continue;
  if (text.toLowerCase() === "sair") break;

  let speaking = false;
  try {
    const result = await runTurn(agent, session, history, text, (event) => {
      if (event.type === "tool-call") console.log(`  · ${event.toolName} ${JSON.stringify(event.args ?? {})}`);
      if (event.type === "text") {
        if (!speaking) stdout.write("nexo › ");
        speaking = true;
        stdout.write(event.text);
      }
    });
    if (result.status === "paused") stdout.write(`  [conversa com o Suporte ${session.handoff?.team}; o agent está pausado]`);
  } catch (error) {
    const message =
      error instanceof ModelCallError && error.rateLimited
        ? "limite de uso do modelo atingido; espere um minuto e reenvie a mensagem"
        : error instanceof Error
          ? error.message
          : String(error);
    stdout.write(`[${message}]`);
  }
  stdout.write("\n\n");
}
rl.close();
