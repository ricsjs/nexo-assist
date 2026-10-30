"use client";

import type { SessionUser } from "@nexo/domain";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const SessionContext = createContext<SessionUser | null>(null);

// Carrega quem está logado e manda para o login (ou para a área certa) quando não combina.
export function SessionGate({ kind, children }: { kind: SessionUser["kind"]; children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    api<SessionUser>("/auth/me")
      .then((u) => {
        if (u.kind !== kind) router.replace(u.kind === "analyst" ? "/console" : "/atendimento");
        else setUser(u);
      })
      .catch(() => router.replace("/login"));
  }, [kind, router]);

  if (!user) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted">Carregando…</div>;
  }
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSessionUser fora do SessionGate");
  return user;
}

export async function logout(router: ReturnType<typeof useRouter>) {
  await api("/auth/logout", { body: {} }).catch(() => {});
  router.replace("/login");
}
