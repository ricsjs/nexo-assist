// Datas sempre no horário de Brasília, como o service desk trabalha.
const TZ = "America/Sao_Paulo";

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "short" }).replace(".", "");
}

export function dateTime(iso: string): string {
  return `${shortDate(iso)}, ${time(iso)}`;
}

// "13:43" se for hoje; "seg., 02/11, 11:21" se for outro dia.
export function deadlineLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = d.toLocaleDateString("pt-BR", { timeZone: TZ }) === now.toLocaleDateString("pt-BR", { timeZone: TZ });
  if (sameDay) return time(iso);
  return d.toLocaleString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function relative(iso: string, now = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}
