"use client";

import { useEffect, useRef } from "react";

// Ouve o canal de avisos do api (SSE). A cada "changed" (e ao conectar ou reconectar, para não
// perder nada que mudou enquanto a conexão estava fora) chama onChange, que busca os dados.
// O EventSource reconecta sozinho; a busca lenta de reserva cobre um proxy que segure o stream.
const FALLBACK_MS = 30_000;

export function useLiveUpdates(path: string, onChange: () => void) {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const source = new EventSource(path);
    const fire = () => callback.current();
    source.addEventListener("ready", fire);
    source.addEventListener("changed", fire);
    const fallback = setInterval(fire, FALLBACK_MS);
    return () => {
      source.close();
      clearInterval(fallback);
    };
  }, [path]);
}
