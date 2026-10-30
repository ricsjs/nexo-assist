import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema.ts";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationsFolder = `${packageRoot}drizzle`;

// Padrão: arquivo local em packages/tickets-service/data/. Em deploy, TICKETS_DB_URL
// pode apontar para outro arquivo ou para um banco LibSQL remoto.
function defaultUrl(): string {
  mkdirSync(`${packageRoot}data`, { recursive: true });
  return `file:${packageRoot}data/tickets.db`;
}

export function createDb(url = process.env.TICKETS_DB_URL ?? defaultUrl()) {
  const client = createClient({ url });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

// Cria ou atualiza as tabelas aplicando as migrations que ainda não rodaram.
export async function migrateDb(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
