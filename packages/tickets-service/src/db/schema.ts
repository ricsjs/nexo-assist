import { Affected, Category, Priority, SupportTeam, TicketStatus, TicketType } from "@nexo/domain";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// O Drizzle exige uma tupla não vazia; um z.enum nunca é vazio, então o cast é seguro.
const values = <T extends string>(e: { options: readonly T[] }) => e.options as [T, ...T[]];

// Datas ficam como texto ISO 8601, o mesmo formato dos tipos do domínio.

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  department: text("department").notNull(),
  passwordChangedAt: text("password_changed_at").notNull(),
});

export const analysts = sqliteTable("analysts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  team: text("team", { enum: values(SupportTeam) }).notNull(),
});

export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: values(TicketType) }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category", { enum: values(Category) }).notNull(),
    subcategory: text("subcategory"),
    priority: text("priority", { enum: values(Priority) }).notNull(),
    status: text("status", { enum: values(TicketStatus) }).notNull(),
    affected: text("affected", { enum: values(Affected) }).notNull(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => employees.id),
    assignedTeam: text("assigned_team", { enum: values(SupportTeam) }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  // Quase toda consulta é "chamados deste funcionário".
  (t) => [index("tickets_requester_idx").on(t.requesterId)],
);

// Histórico do chamado: complementos do funcionário, respostas do analista, transferências.
export const ticketUpdates = sqliteTable(
  "ticket_updates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id),
    authorKind: text("author_kind", { enum: ["employee", "analyst", "agent", "system"] }).notNull(),
    authorId: text("author_id"),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("ticket_updates_ticket_idx").on(t.ticketId)],
);

export const kbArticles = sqliteTable("kb_articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category", { enum: values(Category) }).notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
});
