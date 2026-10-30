"use client";

import type { SessionUser } from "@nexo/domain";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";

// Tela 1: e-mail corporativo e senha, com a apresentação do Nexo Assist.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await api<SessionUser>("/auth/login", { body: { email, password, remember } });
      router.replace(user.kind === "analyst" ? "/console" : "/atendimento");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar agora.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen">
      <Presentation />

      <section className="flex min-h-screen flex-1 flex-col px-8 py-8 lg:px-16">
        <p className="text-right text-sm text-muted">
          Problema para entrar? <span className="font-semibold text-brand">Ligue no ramal 4000</span>
        </p>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <h1 className="font-serif text-4xl text-ink">Entrar</h1>
          <p className="mt-2 text-sm text-muted">Use seu e-mail corporativo e a senha da rede Nexo.</p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            <label className="block">
              <span className="text-sm font-medium">E-mail corporativo</span>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
                <Mail className="size-4 text-muted" />
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome.sobrenome@nexo.com.br"
                  className="h-11 w-full bg-transparent text-sm outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="flex items-center justify-between text-sm font-medium">
                Senha
                <button
                  type="button"
                  onClick={() => setNotice("Para redefinir a senha da rede, acesse senha.nexo.com.br ou ligue no ramal 4000.")}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  Esqueci minha senha
                </button>
              </span>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
                <Lock className="size-4 text-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-muted hover:text-ink"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 accent-brand"
              />
              Manter conectado neste computador
            </label>

            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            {notice && !error && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-dark">{notice}</p>}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? "Entrando…" : "Entrar"}
              {!loading && <ArrowRight className="size-4" />}
            </button>
          </form>

          <div className="mt-8 border-t border-line pt-5 text-xs text-muted">
            <p className="font-medium text-ink-soft">Acesso de demonstração (qualquer senha):</p>
            <p className="mt-1">Funcionária: ana.souza@nexo.com.br · Analista: rafael.lima@nexo.com.br</p>
          </div>
        </div>

        <footer className="flex justify-between text-xs text-muted">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </main>
  );
}

function Presentation() {
  return (
    <section className="hidden min-h-screen w-[55%] flex-col bg-ink px-14 py-12 text-white lg:flex">
      <img src="/logo-white.png" alt="Nexo Assist" width={130} height={24} />

      <div className="flex flex-1 flex-col justify-center">
        <p className="text-sm text-white/60">Service desk de TI da Nexo</p>
        <h2 className="mt-4 max-w-xl font-serif text-5xl leading-tight">Seu problema de TI, resolvido em uma conversa.</h2>
        <p className="mt-6 max-w-md text-white/70">
          Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um
          analista quando precisa.
        </p>

        {/* Exemplo ilustrativo de conversa, como no protótipo. */}
        <div className="mt-12 ml-16 max-w-md space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm">
          <p className="ml-auto w-fit rounded-xl bg-white px-3 py-2 text-ink">Meu notebook não conecta na VPN. Erro 809.</p>
          <p className="text-xs text-white/50">
            <span className="font-semibold text-white">Nexo Assist</span> consultou seus chamados · criou um chamado
          </p>
          <p className="w-fit max-w-xs rounded-xl bg-white/10 px-3 py-2">
            Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
          </p>
          <p className="flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-ink">
            <span className="size-2 rounded-full bg-warn" />
            <b>INC-20517</b> <span className="text-muted">Rede e VPN · Alta · em até 4 h</span>
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 border-t border-white/10 pt-6">
        {[
          ["8 s", "primeira resposta, em média"],
          ["72%", "resolvidos sem fila"],
          ["6", "analistas online agora"],
        ].map(([value, label], i) => (
          <div key={label} className={i > 0 ? "border-l border-white/10 pl-6" : ""}>
            <dt className="font-serif text-3xl">
              {value}
              {i === 2 && <span className="ml-2 inline-block size-2 rounded-full bg-ok align-middle" />}
            </dt>
            <dd className="mt-1 text-xs text-white/60">{label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
