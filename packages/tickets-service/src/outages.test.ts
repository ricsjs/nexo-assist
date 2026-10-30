import { describe, expect, it } from "vitest";
import { ServiceUnavailableError } from "./errors.ts";
import { withSimulatedOutages } from "./outages.ts";

const fake = { ping: async (x: number) => x * 2 };

describe("withSimulatedOutages", () => {
  it("com taxa 0 devolve o próprio objeto", () => {
    expect(withSimulatedOutages(fake, { outageRate: 0, outageMs: 1000 })).toBe(fake);
  });

  it("repassa a chamada quando o sistema está no ar", async () => {
    const svc = withSimulatedOutages(fake, { outageRate: 0.5, outageMs: 1000, random: () => 0.9 });
    expect(await svc.ping(21)).toBe(42);
  });

  it("depois de cair, continua fora durante a janela e volta depois", async () => {
    let clock = 0;
    let roll = 0; // primeira chamada derruba
    const svc = withSimulatedOutages(fake, {
      outageRate: 0.5,
      outageMs: 1000,
      random: () => roll,
      now: () => clock,
    });

    await expect(svc.ping(1)).rejects.toThrow(ServiceUnavailableError);
    roll = 0.9; // daqui em diante não cai de novo
    clock = 999;
    await expect(svc.ping(1)).rejects.toThrow(ServiceUnavailableError);
    clock = 1000;
    expect(await svc.ping(1)).toBe(2);
  });

  it("logo depois de voltar não cai de novo", async () => {
    let clock = 0;
    const svc = withSimulatedOutages(fake, {
      outageRate: 0.5,
      outageMs: 1000,
      random: () => 0, // toda chamada "tentaria" derrubar
      now: () => clock,
    });

    await expect(svc.ping(1)).rejects.toThrow(ServiceUnavailableError);
    clock = 1000; // voltou: fica estável por 10x a duração da queda
    expect(await svc.ping(1)).toBe(2);
    clock = 10_999;
    expect(await svc.ping(1)).toBe(2);
    clock = 11_000; // passou o período estável: pode cair de novo
    await expect(svc.ping(1)).rejects.toThrow(ServiceUnavailableError);
  });
});
