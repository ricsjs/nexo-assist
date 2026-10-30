import { ServiceUnavailableError } from "./errors.ts";

export interface OutageOptions {
  // Chance de uma chamada derrubar o sistema (0 = nunca, 1 = sempre).
  outageRate: number;
  // Quanto tempo o sistema fica fora depois de cair.
  outageMs: number;
  random?: () => number;
  now?: () => number;
}

// Simula o legado instável: de vez em quando o sistema cai e, enquanto não volta,
// toda chamada falha com ServiceUnavailableError. Envolve qualquer objeto de métodos
// assíncronos sem mudar o tipo, então quem usa nem sabe que está ali.
export function withSimulatedOutages<T extends object>(target: T, options: OutageOptions): T {
  const { outageRate, outageMs, random = Math.random, now = Date.now } = options;
  if (outageRate <= 0) return target;

  // Depois de voltar, o sistema fica de pé por um tempo antes de poder cair de novo;
  // sem isso, a própria nova tentativa poderia derrubá-lo outra vez.
  const stableMs = outageMs * 10;
  let downUntil = 0;
  let stableUntil = 0;
  const check = () => {
    const t = now();
    if (t < downUntil) throw new ServiceUnavailableError();
    if (t >= stableUntil && random() < outageRate) {
      downUntil = t + outageMs;
      stableUntil = downUntil + stableMs;
      throw new ServiceUnavailableError();
    }
  };

  const wrapped = {} as Record<string, unknown>;
  for (const [name, value] of Object.entries(target)) {
    wrapped[name] =
      typeof value === "function"
        ? async (...args: unknown[]) => {
            check();
            return (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          }
        : value;
  }
  return wrapped as T;
}
