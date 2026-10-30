import { ConversationStatus, type TurnTrace, type Widget } from "@nexo/domain";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Handoff, PendingAction } from "../agent/session.js";

// Banco do api: conversas e o estado de cada uma (com o agent ou com um analista).
// Separado do banco de chamados, que pertence ao tickets-service.

const values = <T extends string>(e: { options: readonly T[] }) => e.options as [T, ...T[]];

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull(),
    status: text("status", { enum: values(ConversationStatus) }).notNull(),
    analystId: text("analyst_id"),
    // Estado do agent entre mensagens: o que precisa sobreviver a um reinício.
    turn: integer("turn").notNull().default(0),
    pendingAction: text("pending_action", { mode: "json" }).$type<PendingAction>(),
    handoff: text("handoff", { mode: "json" }).$type<Handoff>(),
    userMessages: integer("user_messages").notNull().default(0),
    // Menor confiança declarada pelo agent, quando abaixo do limite: destaca a conversa no console.
    lowConfidence: real("low_confidence"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    closedAt: text("closed_at"),
  },
  (t) => [index("conversations_employee_idx").on(t.employeeId), index("conversations_status_idx").on(t.status)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    role: text("role", { enum: ["user", "agent", "analyst", "event"] }).notNull(),
    authorId: text("author_id"),
    authorName: text("author_name"),
    authorTeam: text("author_team"),
    content: text("content").notNull(),
    widgets: text("widgets", { mode: "json" }).$type<Widget[]>().notNull().default([]),
    trace: text("trace", { mode: "json" }).$type<TurnTrace>(),
    // Mensagens no formato do modelo (com chamadas de ferramenta), para remontar o histórico.
    modelMessages: text("model_messages", { mode: "json" }).$type<unknown[]>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)],
);
