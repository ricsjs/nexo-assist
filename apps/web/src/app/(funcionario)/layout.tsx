"use client";

import { LogOut, MessageSquare, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { initials } from "@/lib/format";
import { logout, SessionGate, useSessionUser } from "@/lib/session";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate kind="employee">
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </SessionGate>
  );
}

function Sidebar() {
  const user = useSessionUser();
  const pathname = usePathname();
  const router = useRouter();
  const items = [
    { href: "/atendimento", label: "Atendimento", icon: MessageSquare },
    { href: "/perfil", label: "Meu perfil", icon: User },
  ];

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
      <img src="/logo.png" alt="Nexo Assist" width={136} height={20} className="ml-2" />
      <nav className="mt-8 space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                active ? "bg-brand-soft font-semibold text-brand" : "text-ink-soft hover:bg-canvas"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-line pt-4">
        <div className="flex items-center gap-3 px-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => logout(router)}
          className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-canvas"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
