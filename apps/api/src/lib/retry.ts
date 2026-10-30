import { TicketsServiceError } from "@nexo/tickets-service";

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  // Avisado a cada nova tentativa; o agent usa isso para registrar na transparência.
  onRetry?: (info: { operation: string; attempt: number; delayMs: number; error: unknown }) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export const DEFAULT_RETRY: RetryOptions = { maxAttempts: 4, baseDelayMs: 300 };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Só a indisponibilidade é transitória. "Não encontrado" ou "rascunho inválido"
// dariam o mesmo resultado na próxima tentativa.
export function isTransient(error: unknown): boolean {
  return error instanceof TicketsServiceError && error.code === "service_unavailable";
}

// Backoff exponencial com jitter: 300ms, 600ms, 1200ms (±20%). O jitter evita que
// várias conversas batam no sistema ao mesmo tempo quando ele volta.
export function backoffDelay(attempt: number, baseDelayMs: number, random: () => number): number {
  return Math.round(baseDelayMs * 2 ** (attempt - 1) * (0.8 + 0.4 * random()));
}

export async function retry<R>(operation: string, call: () => Promise<R>, options: RetryOptions): Promise<R> {
  const { maxAttempts, baseDelayMs, onRetry, sleep = defaultSleep, random = Math.random } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (!isTransient(error) || attempt >= maxAttempts) throw error;
      const delayMs = backoffDelay(attempt, baseDelayMs, random);
      onRetry?.({ operation, attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}

// Aplica retry em todos os métodos assíncronos de um objeto, mantendo o tipo.
export function withRetry<T extends object>(target: T, options: RetryOptions): T {
  const wrapped = {} as Record<string, unknown>;
  for (const [name, value] of Object.entries(target)) {
    wrapped[name] =
      typeof value === "function"
        ? (...args: unknown[]) =>
            retry(name, () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args), options)
        : value;
  }
  return wrapped as T;
}
