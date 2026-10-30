import { ChevronRight } from "lucide-react";

// Cabeçalho com a trilha "Service desk de TI > Página" e um selo de status à direita.
export function PageHeader({ title, status }: { title: string; status?: React.ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-6">
      <p className="flex items-center gap-2 text-sm text-muted">
        Service desk de TI <ChevronRight className="size-3.5" />
        <span className="font-semibold text-ink">{title}</span>
      </p>
      {status}
    </header>
  );
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "info"; children: React.ReactNode }) {
  const styles = {
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    info: "bg-brand-soft text-brand",
  }[tone];
  const dot = { ok: "bg-ok", warn: "bg-warn", info: "bg-brand" }[tone];
  return (
    <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${styles}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
