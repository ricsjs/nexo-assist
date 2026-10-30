import { z } from "zod";

// Transparência: para cada resposta, o que o agent entendeu, que ação tomou,
// com que grau de segurança e por quê (PRD, item 7).

export const Intent = z.enum([
  "question",
  "ticket_status",
  "new_ticket",
  "update_ticket",
  "talk_to_analyst",
  "out_of_scope",
  "other",
]);
export type Intent = z.infer<typeof Intent>;

export const INTENT_LABEL: Record<Intent, string> = {
  question: "Dúvida",
  ticket_status: "Consulta de chamado",
  new_ticket: "Abertura de chamado",
  update_ticket: "Complemento ou reabertura",
  talk_to_analyst: "Falar com analista",
  out_of_scope: "Fora do escopo de TI",
  other: "Outro",
};

// Abaixo disso o agent não tem segurança para decidir e a conversa vai para um analista (Anexo A).
export const LOW_CONFIDENCE = 0.5;

// O que o próprio modelo declara sobre a mensagem.
export const Decision = z.object({
  understood: z.string().describe("O que o funcionário quer, em uma frase"),
  intent: Intent,
  action: z.string().describe("O que você decidiu fazer agora"),
  confidence: z.number().min(0).max(1).describe("0 a 1: quão seguro você está da interpretação e da ação"),
  reason: z.string().describe("Por quê: a regra do service desk ou a informação que levou a essa ação"),
  options: z
    .array(z.string().max(40))
    .max(4)
    .optional()
    .describe(
      "Só quando sua resposta termina com uma pergunta de escolha: as respostas curtas possíveis (ex.: Só eu, Minha equipe, Toda a empresa). Omita nos outros casos.",
    ),
});
export type Decision = z.infer<typeof Decision>;

// O que de fato aconteceu, registrado pelo código a partir das ferramentas chamadas.
export interface TraceStep {
  tool: string;
  label: string;
  ok: boolean;
  summary: string;
}

export interface TurnTrace {
  turn: number;
  decision: Decision | null;
  steps: TraceStep[];
  model: string;
  durationMs: number;
  tokens: { input: number; output: number } | null;
}
