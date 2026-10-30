// Limites de uso para o deploy público: protegem a cota do modelo contra abuso e custo
// inesperado. Janela fixa em memória: suficiente para uma instância só (ver README, trade-offs).

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export function createRateLimiter(rule: RateLimitRule, now: () => number = Date.now) {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    // Conta uma tentativa para a chave; devolve quanto falta esperar se estourou o limite.
    hit(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
      const t = now();
      const w = windows.get(key);
      if (!w || t - w.start >= rule.windowMs) {
        windows.set(key, { start: t, count: 1 });
        return { allowed: true };
      }
      if (w.count >= rule.limit) return { allowed: false, retryAfterMs: w.start + rule.windowMs - t };
      w.count++;
      return { allowed: true };
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
