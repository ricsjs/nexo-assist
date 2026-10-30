"use client";

import type { SessionUser } from "@nexo/domain";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";

// Entrada: manda cada um para a sua tela (funcionário → chat, analista → console).
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api<SessionUser>("/auth/me")
      .then((u) => router.replace(u.kind === "analyst" ? "/console" : "/atendimento"))
      .catch(() => router.replace("/login"));
  }, [router]);
  return null;
}
