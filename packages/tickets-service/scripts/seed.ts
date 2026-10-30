import { createDb, migrateDb, schema } from "../src/db/index.js";
import { seed } from "../src/seed/index.js";

const db = createDb();
await migrateDb(db);
await seed(db);
console.log(`Banco recriado com ${await db.$count(schema.tickets)} chamados de exemplo.`);
