import { schema, type Db } from "../db/index.js";
import { buildSeedData } from "./data.js";

// Apaga tudo e recria os dados de exemplo. Roda numa transação: ou entra tudo, ou nada.
export async function seed(db: Db, now = new Date()): Promise<void> {
  const data = buildSeedData(now);
  await db.transaction(async (tx) => {
    // Ordem importa por causa das chaves estrangeiras: filhos antes dos pais.
    await tx.delete(schema.ticketUpdates);
    await tx.delete(schema.tickets);
    await tx.delete(schema.kbArticles);
    await tx.delete(schema.analysts);
    await tx.delete(schema.employees);

    await tx.insert(schema.employees).values(data.employees);
    await tx.insert(schema.analysts).values(data.analysts);
    await tx.insert(schema.tickets).values(data.tickets);
    await tx.insert(schema.ticketUpdates).values(data.ticketUpdates);
    await tx.insert(schema.kbArticles).values(data.kbArticles);
  });
}
