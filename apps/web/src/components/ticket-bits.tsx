import { CATEGORY_LABEL, PRIORITY_RULES, TICKET_STATUS_LABEL, type Priority, type TicketStatus, type TicketView } from "@nexo/domain";

const STATUS_TONE: Record<TicketStatus, { dot: string; text: string }> = {
  awaiting_analyst: { dot: "bg-warn", text: "text-warn" },
  in_progress: { dot: "bg-info", text: "text-info" },
  approved: { dot: "bg-ok", text: "text-ok" },
  resolved: { dot: "bg-gray-400", text: "text-muted" },
  cancelled: { dot: "bg-gray-400", text: "text-muted" },
};

const PRIORITY_DOT: Record<Priority, string> = {
  critical: "bg-danger",
  high: "bg-warn",
  medium: "bg-gray-400",
  low: "bg-gray-300",
};

export function StatusLabel({ status, strong = false }: { status: TicketStatus; strong?: boolean }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${strong ? `font-medium ${tone.text}` : "text-muted"}`}>
      <span className={`size-1.5 rounded-full ${tone.dot}`} />
      {TICKET_STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${PRIORITY_DOT[priority]}`} />
      {PRIORITY_RULES[priority].label}
    </span>
  );
}

export function categoryLabel(t: Pick<TicketView, "category" | "subcategory">): string {
  return t.subcategory ? `${CATEGORY_LABEL[t.category]} › ${t.subcategory}` : CATEGORY_LABEL[t.category];
}
