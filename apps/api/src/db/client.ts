import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema.ts";

const appRoot = fileURLToPath(new URL("../../", import.meta.url));

function defaultUrl(): string {
  mkdirSync(`${appRoot}data`, { recursive: true });
  return `file:${appRoot}data/app.db`;
}

export function createAppDb(url = process.env.APP_DB_URL ?? defaultUrl()) {
  return drizzle(createClient({ url }), { schema });
}

export type AppDb = ReturnType<typeof createAppDb>;

export async function migrateAppDb(db: AppDb): Promise<void> {
  await migrate(db, { migrationsFolder: `${appRoot}drizzle` });
}

export { schema };
