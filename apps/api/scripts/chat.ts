import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { createNexoAgent } from "../src/agent/nexo-agent.js";
import { loadConfig } from "../src/config.js";

// Chat de terminal para conversar com o agent enquanto a interface não existe.
// O histórico fica só na memória deste processo; persistência vem depois.
let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
const agent = createNexoAgent(config.LLM_MODEL);
type ChatMessage = { role: "user"; content: string } | { role: "assistant"; content: string };
const history: ChatMessage[] = [];
const rl = createInterface({ input: stdin, output: stdout });

console.log(`Nexo Assist (${config.LLM_MODEL}). Digite "sair" para encerrar.\n`);

for (;;) {
  const text = (await rl.question("você › ")).trim();
  if (text === "") continue;
  if (text.toLowerCase() === "sair") break;

  history.push({ role: "user", content: text });
  stdout.write("nexo › ");
  try {
    const result = await agent.stream(history);
    let answer = "";
    for await (const chunk of result.textStream) {
      answer += chunk;
      stdout.write(chunk);
    }
    history.push({ role: "assistant", content: answer });
  } catch (error) {
    history.pop();
    stdout.write(`[erro ao falar com o modelo: ${error instanceof Error ? error.message : String(error)}]`);
  }
  stdout.write("\n\n");
}
rl.close();
