// Datas já formatadas no horário de Brasília para o modelo: ele erra contas de fuso
// e de "há quantos dias" com frequência, então recebe o texto pronto.
const TIME_ZONE = "America/Sao_Paulo";

export function formatDateTime(date: Date): string {
  return date.toLocaleString("pt-BR", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(date: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}
