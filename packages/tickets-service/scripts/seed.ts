import { createDb, migrateDb, schema } from "../src/db/index.ts";
import { seed } from "../src/seed/index.ts";

const db = createDb();
await migrateDb(db);
await seed(db);
console.log(`Banco recriado com ${await db.$count(schema.tickets)} chamados de exemplo.`);
