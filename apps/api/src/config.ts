import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// O .env fica na raiz do monorepo. Em deploy as variáveis vêm do ambiente e o arquivo não existe.
const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const Env = z
  .object({
    // Formato "provedor/modelo" do Mastra. Trocar de modelo ou de provedor é só mudar aqui.
    LLM_MODEL: z.string().default("google/gemini-3.5-flash"),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    TICKETS_OUTAGE_RATE: z.coerce.number().min(0).max(1).default(0.05),
    TICKETS_OUTAGE_MS: z.coerce.number().int().positive().default(1500),
    PORT: z.coerce.number().int().positive().default(3001),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Assina o cookie de sessão. Em produção é obrigatório e precisa ser longo.
    SESSION_SECRET: z.string().min(32).default("dev-only-secret-change-me-0123456789abcdef"),
  })
  // Falha cedo, com mensagem clara, se a chave do provedor escolhido não estiver definida.
  .superRefine((env, ctx) => {
    const required: Record<string, keyof typeof env> = {
      google: "GOOGLE_GENERATIVE_AI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
    };
    const provider = env.LLM_MODEL.split("/")[0] ?? "";
    const key = required[provider];
    if (key && !env[key]) {
      ctx.addIssue({ code: "custom", path: [key], message: `obrigatória para usar ${env.LLM_MODEL}` });
    }
    if (env.NODE_ENV === "production" && env.SESSION_SECRET.startsWith("dev-only")) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "defina um segredo próprio em produção" });
    }
  });

export type Config = z.infer<typeof Env>;

export function loadConfig(): Config {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida (veja .env.example):\n${problems}`);
  }
  return parsed.data;
}
