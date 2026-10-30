import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit.ts";

describe("createRateLimiter", () => {
  it("bloqueia depois do limite e libera quando a janela vira", () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 }, () => clock);
    expect(limiter.hit("ana").allowed).toBe(true);
    expect(limiter.hit("ana").allowed).toBe(true);
    clock = 400;
    expect(limiter.hit("ana")).toEqual({ allowed: false, retryAfterMs: 600 });
    clock = 1000;
    expect(limiter.hit("ana").allowed).toBe(true);
  });

  it("conta cada chave separadamente", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 }, () => 0);
    expect(limiter.hit("ana").allowed).toBe(true);
    expect(limiter.hit("bruno").allowed).toBe(true);
    expect(limiter.hit("ana").allowed).toBe(false);
  });
});
