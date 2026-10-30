"use client";

import { KeyRound, Lock, Mail, RotateCcw } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { relative } from "@/lib/format";
import { useSessionUser } from "@/lib/session";

export default function ProfilePage() {
  const user = useSessionUser();
  const [sent, setSent] = useState(false);

  return (
    <>
      <PageHeader title="Meu perfil" />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-6 py-12">
          <h1 className="text-2xl font-semibold">Meu perfil</h1>
          <p className="mt-1 text-sm text-muted">Seus dados de acesso ao service desk de TI.</p>

          <section className="mt-6 divide-y divide-line rounded-xl border border-line shadow-sm">
            <Row label="Nome" value={user.name} />
            <Row
              label="E-mail corporativo"
              value={user.email}
              aside={
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Lock className="size-3" /> Gerenciado pela TI
                </span>
              }
            />
          </section>

          <section className="mt-4 overflow-hidden rounded-xl border border-line shadow-sm">
            <div className="flex items-center gap-4 p-5">
              <span className="flex size-10 items-center justify-center rounded-full bg-canvas">
                <KeyRound className="size-4 text-ink-soft" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Senha</p>
                <p className="text-xs text-muted">
                  {user.passwordChangedAt ? `Alterada ${relative(user.passwordChangedAt)}` : "Senha da rede Nexo"}
                </p>
              </div>
              <button
                onClick={() => setSent(true)}
                disabled={sent}
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-60"
              >
                <RotateCcw className="size-3.5" /> {sent ? "Link enviado" : "Redefinir senha"}
              </button>
            </div>
            <p className="flex items-center gap-2 border-t border-line bg-canvas px-5 py-3 text-xs text-muted">
              <Mail className="size-3.5" />
              {sent
                ? `Enviamos um link de redefinição para ${user.email}.`
                : `Enviaremos um link de redefinição para ${user.email}.`}
            </p>
          </section>
        </div>
      </main>
    </>
  );
}

function Row({ label, value, aside }: { label: string; value: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 text-sm">
      <span className="w-40 text-muted">{label}</span>
      <span className="flex-1 font-medium">{value}</span>
      {aside}
    </div>
  );
}
