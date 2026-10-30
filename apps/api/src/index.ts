import { createDb, createTicketsService, migrateDb } from "@nexo/tickets-service";

const db = createDb();
await migrateDb(db);
const tickets = createTicketsService({ db });

const ana = await tickets.findEmployeeByEmail("ana.souza@nexo.com.br");
console.log("Chamados abertos da Ana:", (await tickets.listTickets(ana!.id)).map((t) => t.id));
