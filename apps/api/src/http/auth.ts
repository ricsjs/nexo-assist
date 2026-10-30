import type { Analyst, Employee, SessionUser } from "@nexo/domain";
import type { TicketsService } from "@nexo/tickets-service";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";

// Sessão em cookie httpOnly assinado: o navegador guarda, o JavaScript da página não lê,
// e qualquer alteração invalida a assinatura. Conteúdo: "employee:emp-ana" ou "analyst:an-rafael".
const COOKIE = "nexo_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export type AuthEnv = {
  Variables: { employee: Employee; analyst: Analyst };
};

export interface AuthDeps {
  tickets: TicketsService;
  secret: string;
  secure: boolean;
}

export function createAuth({ tickets, secret, secure }: AuthDeps) {
  async function readSession(c: Context): Promise<{ kind: "employee" | "analyst"; id: string } | null> {
    const value = await getSignedCookie(c, secret, COOKIE);
    if (!value) return null;
    const [kind, id] = value.split(":");
    if ((kind !== "employee" && kind !== "analyst") || !id) return null;
    return { kind, id };
  }

  return {
    // Protótipo: aceita qualquer senha não vazia para os funcionários e analistas dos dados de exemplo.
    async login(c: Context, email: string, remember: boolean): Promise<SessionUser | null> {
      const employee = await tickets.findEmployeeByEmail(email);
      const analyst = employee ? null : await tickets.findAnalystByEmail(email);
      if (!employee && !analyst) return null;
      const kind = employee ? "employee" : "analyst";
      const id = (employee ?? analyst)!.id;
      await setSignedCookie(c, COOKIE, `${kind}:${id}`, secret, {
        httpOnly: true,
        sameSite: "Lax",
        secure,
        path: "/",
        // Sem "manter conectado", o cookie vale só até fechar o navegador.
        ...(remember && { maxAge: THIRTY_DAYS }),
      });
      return employee ? employeeUser(employee) : analystUser(analyst!);
    },

    logout(c: Context) {
      deleteCookie(c, COOKIE, { path: "/" });
    },

    async me(c: Context): Promise<SessionUser | null> {
      const session = await readSession(c);
      if (!session) return null;
      if (session.kind === "employee") {
        const employee = await tickets.getEmployee(session.id).catch(() => null);
        return employee ? employeeUser(employee) : null;
      }
      const analyst = await tickets.getAnalyst(session.id);
      return analyst ? analystUser(analyst) : null;
    },

    requireEmployee: (async (c, next) => {
      const session = await readSession(c);
      const employee = session?.kind === "employee" ? await tickets.getEmployee(session.id).catch(() => null) : null;
      if (!employee) return c.json({ error: "unauthorized", message: "Entre com seu e-mail corporativo." }, 401);
      c.set("employee", employee);
      await next();
    }) satisfies MiddlewareHandler<AuthEnv>,

    requireAnalyst: (async (c, next) => {
      const session = await readSession(c);
      const analyst = session?.kind === "analyst" ? await tickets.getAnalyst(session.id) : null;
      if (!analyst) return c.json({ error: "unauthorized", message: "Acesso restrito aos analistas." }, 401);
      c.set("analyst", analyst);
      await next();
    }) satisfies MiddlewareHandler<AuthEnv>,
  };
}

const employeeUser = (e: Employee): SessionUser => ({
  kind: "employee",
  id: e.id,
  name: e.name,
  email: e.email,
  department: e.department,
  passwordChangedAt: e.passwordChangedAt,
});

const analystUser = (a: Analyst): SessionUser => ({ kind: "analyst", id: a.id, name: a.name, email: a.email, team: a.team });
