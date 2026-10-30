import { ServiceUnavailableError, TicketNotFoundError } from "@nexo/tickets-service";
import { describe, expect, it, vi } from "vitest";
import { backoffDelay, retry, withRetry, type RetryOptions } from "./retry.js";

// Sem espera de verdade e sem aleatoriedade: os testes rodam instantâneos e determinísticos.
const options = (extra: Partial<RetryOptions> = {}): RetryOptions => ({
  maxAttempts: 4,
  baseDelayMs: 300,
  sleep: async () => {},
  random: () => 0.5,
  ...extra,
});

// Falha `times` vezes com indisponibilidade e depois responde.
function flaky<R>(times: number, value: R) {
  let calls = 0;
  const fn = vi.fn(async () => {
    calls++;
    if (calls <= times) throw new ServiceUnavailableError();
    return value;
  });
  return fn;
}

describe("retry", () => {
  it("responde de primeira sem esperar", async () => {
    const sleep = vi.fn(async () => {});
    expect(await retry("op", flaky(0, "ok"), options({ sleep }))).toBe("ok");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("tenta de novo enquanto o sistema está fora", async () => {
    const call = flaky(2, "ok");
    expect(await retry("op", call, options())).toBe("ok");
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("desiste depois do máximo de tentativas e devolve o erro", async () => {
    const call = flaky(10, "ok");
    await expect(retry("op", call, options())).rejects.toThrow(ServiceUnavailableError);
    expect(call).toHaveBeenCalledTimes(4);
  });

  it("não repete erros que não são transitórios", async () => {
    const call = vi.fn(async () => {
      throw new TicketNotFoundError("INC-1");
    });
    await expect(retry("op", call, options())).rejects.toThrow(TicketNotFoundError);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("espera cada vez mais e avisa cada nova tentativa", async () => {
    const onRetry = vi.fn();
    await retry("listTickets", flaky(3, "ok"), options({ onRetry }));
    expect(onRetry.mock.calls.map(([i]) => [i.operation, i.attempt, i.delayMs])).toEqual([
      ["listTickets", 1, 300],
      ["listTickets", 2, 600],
      ["listTickets", 3, 1200],
    ]);
  });
});

describe("backoffDelay", () => {
  it("varia no máximo 20% para cada lado", () => {
    expect(backoffDelay(1, 300, () => 0)).toBe(240);
    expect(backoffDelay(1, 300, () => 1)).toBe(360);
  });
});

describe("withRetry", () => {
  it("aplica retry em cada método e mantém o this do objeto", async () => {
    let failures = 1;
    const service = {
      factor: 2,
      async double(x: number) {
        if (failures-- > 0) throw new ServiceUnavailableError();
        return x * this.factor;
      },
    };
    expect(await withRetry(service, options()).double(21)).toBe(42);
  });
});
