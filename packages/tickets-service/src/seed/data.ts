import type { schema } from "../db/index.js";

type NewEmployee = typeof schema.employees.$inferInsert;
type NewAnalyst = typeof schema.analysts.$inferInsert;
type NewTicket = typeof schema.tickets.$inferInsert;
type NewTicketUpdate = typeof schema.ticketUpdates.$inferInsert;
type NewKbArticle = typeof schema.kbArticles.$inferInsert;

export interface SeedData {
  employees: NewEmployee[];
  analysts: NewAnalyst[];
  tickets: NewTicket[];
  ticketUpdates: NewTicketUpdate[];
  kbArticles: NewKbArticle[];
}

// Datas relativas ao momento do seed, para a demonstração continuar fazendo sentido
// em qualquer dia: INC-20311 sempre vencido, INC-20150 sempre reabrível.
export function buildSeedData(now: Date): SeedData {
  const ago = (days: number, hours = 0) =>
    new Date(now.getTime() - (days * 24 + hours) * 3_600_000).toISOString();

  const employees: NewEmployee[] = [
    { id: "emp-ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", department: "Financeiro", passwordChangedAt: ago(42) },
    { id: "emp-carla", name: "Carla Mendes", email: "carla.mendes@nexo.com.br", department: "Comercial", passwordChangedAt: ago(15) },
    { id: "emp-bruno", name: "Bruno Tavares", email: "bruno.tavares@nexo.com.br", department: "Operações", passwordChangedAt: ago(80) },
    { id: "emp-diego", name: "Diego Ramos", email: "diego.ramos@nexo.com.br", department: "Marketing", passwordChangedAt: ago(5) },
    { id: "emp-elisa", name: "Elisa Prado", email: "elisa.prado@nexo.com.br", department: "Jurídico", passwordChangedAt: ago(30) },
    { id: "emp-fabio", name: "Fábio Nunes", email: "fabio.nunes@nexo.com.br", department: "RH", passwordChangedAt: ago(60) },
    { id: "emp-gabriela", name: "Gabriela Rocha", email: "gabriela.rocha@nexo.com.br", department: "Recepção", passwordChangedAt: ago(10) },
  ];

  const analysts: NewAnalyst[] = [
    { id: "an-rafael", name: "Rafael Lima", email: "rafael.lima@nexo.com.br", team: "N2" },
    { id: "an-juliana", name: "Juliana Costa", email: "juliana.costa@nexo.com.br", team: "N1" },
  ];

  const tickets: NewTicket[] = [
    // Ana: 3 abertos (um vencido) e 2 encerrados, como no console (Telas 3 e 4).
    {
      id: "INC-20311", type: "INC", category: "hardware", subcategory: "Notebook",
      title: "Notebook lento após atualização do Windows",
      description: "Lentidão geral desde a última atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.",
      priority: "medium", status: "awaiting_analyst", affected: "only_me", requesterId: "emp-ana",
      createdAt: ago(8), updatedAt: ago(6),
    },
    {
      id: "INC-20298", type: "INC", category: "access",
      title: "Acesso à pasta Financeiro no SharePoint",
      description: "Perdi o acesso à pasta Financeiro/Fechamento no SharePoint depois da troca de gestor.",
      priority: "medium", status: "in_progress", affected: "only_me", requesterId: "emp-ana", assignedTeam: "N1",
      createdAt: ago(10), updatedAt: ago(1),
    },
    {
      id: "REQ-10442", type: "REQ", category: "hardware", subcategory: "Monitor",
      title: "Segundo monitor para home office",
      description: "Pedido de um segundo monitor para trabalhar em casa. Aprovado pela gestora.",
      priority: "low", status: "approved", affected: "only_me", requesterId: "emp-ana",
      createdAt: ago(21), updatedAt: ago(3),
    },
    {
      id: "INC-20150", type: "INC", category: "access", subcategory: "SAP",
      title: "Senha do SAP bloqueada",
      description: "Senha do SAP bloqueada após tentativas erradas.",
      priority: "medium", status: "resolved", affected: "only_me", requesterId: "emp-ana", assignedTeam: "N1",
      createdAt: ago(6), updatedAt: ago(4), resolvedAt: ago(4),
    },
    {
      id: "INC-19877", type: "INC", category: "email",
      title: "Outlook não sincroniza no celular",
      description: "E-mails não aparecem no Outlook do celular.",
      priority: "low", status: "resolved", affected: "only_me", requesterId: "emp-ana", assignedTeam: "N1",
      createdAt: ago(60), updatedAt: ago(58), resolvedAt: ago(58),
    },

    // Outros funcionários: servem para testar privacidade e o console do analista.
    {
      id: "INC-20320", type: "INC", category: "access", subcategory: "SAP",
      title: "Sem acesso ao SAP",
      description: "Usuário do SAP não entra desde hoje cedo. Preciso emitir pedidos ainda hoje.",
      priority: "high", status: "awaiting_analyst", affected: "only_me", requesterId: "emp-carla",
      createdAt: ago(0, 2), updatedAt: ago(0, 2),
    },
    {
      id: "INC-20305", type: "INC", category: "network_vpn",
      title: "VPN cai a cada 10 minutos",
      description: "A VPN conecta, mas cai a cada 10 minutos. Windows 11.",
      priority: "medium", status: "in_progress", affected: "only_me", requesterId: "emp-bruno", assignedTeam: "N2",
      createdAt: ago(3), updatedAt: ago(1),
    },
    {
      id: "REQ-10450", type: "REQ", category: "software",
      title: "Licença do Power BI Pro",
      description: "Licença do Power BI Pro para os relatórios de campanha.",
      priority: "low", status: "awaiting_analyst", affected: "only_me", requesterId: "emp-diego",
      createdAt: ago(2), updatedAt: ago(2),
    },
    {
      id: "INC-20280", type: "INC", category: "software",
      title: "Sistema da folha fora do ar",
      description: "O sistema da folha de pagamento não abre para ninguém do RH.",
      priority: "critical", status: "resolved", affected: "my_team", requesterId: "emp-fabio", assignedTeam: "N2",
      createdAt: ago(2), updatedAt: ago(1), resolvedAt: ago(1),
    },
    {
      id: "REQ-10431", type: "REQ", category: "network_vpn",
      title: "Senha do Wi-Fi de visitantes",
      description: "Senha da rede de visitantes para receber um fornecedor.",
      priority: "low", status: "resolved", affected: "only_me", requesterId: "emp-gabriela", assignedTeam: "N1",
      createdAt: ago(20), updatedAt: ago(20), resolvedAt: ago(20),
    },
  ];

  const ticketUpdates: NewTicketUpdate[] = [
    { ticketId: "INC-20311", authorKind: "system", body: "Chamado aberto pelo funcionário.", createdAt: ago(8) },
    { ticketId: "INC-20311", authorKind: "employee", authorId: "emp-ana", body: "Reiniciei e rodei o diagnóstico da central de ajuda, continua lento.", createdAt: ago(6) },
    { ticketId: "INC-20298", authorKind: "analyst", authorId: "an-juliana", body: "Solicitei a permissão ao dono da pasta. Aguardando aprovação.", createdAt: ago(1) },
    { ticketId: "REQ-10442", authorKind: "analyst", authorId: "an-juliana", body: "Aprovado. Monitor separado para envio.", createdAt: ago(3) },
    { ticketId: "INC-20150", authorKind: "analyst", authorId: "an-juliana", body: "Senha desbloqueada. Troque no próximo acesso.", createdAt: ago(4) },
  ];

  const kbArticles: NewKbArticle[] = [
    {
      id: "KB-001", category: "network_vpn", title: "VPN com erro 809",
      body: "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
      tags: ["vpn", "809", "windows 10", "conexão"],
    },
    {
      id: "KB-002", category: "other", title: "Horário do service desk",
      body: "De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
      tags: ["horário", "atendimento", "plantão"],
    },
    {
      id: "KB-003", category: "access", title: "Esqueci ou bloqueei a senha da rede",
      body: "Acesse senha.nexo.com.br pelo celular, confirme com o código enviado por SMS e defina uma nova senha. Senhas do SAP não são trocadas por esse portal: para elas, abra um chamado.",
      tags: ["senha", "bloqueio", "rede", "login"],
    },
    {
      id: "KB-004", category: "email", title: "Configurar o Outlook no celular",
      body: "Instale o Outlook pela loja do celular, entre com o e-mail corporativo e aprove o acesso no Authenticator. Se os e-mails não sincronizarem, remova a conta e adicione de novo.",
      tags: ["outlook", "celular", "sincronizar", "e-mail"],
    },
    {
      id: "KB-005", category: "hardware", title: "Computador lento",
      body: "Reinicie o computador e rode o Diagnóstico Nexo pela central de software. Se continuar lento depois de uma atualização do Windows, abra um chamado informando quando começou.",
      tags: ["lento", "lentidão", "desempenho", "atualização", "notebook"],
    },
    {
      id: "KB-006", category: "network_vpn", title: "Wi-Fi de visitantes",
      body: "A rede Nexo-Visitantes tem senha trocada toda segunda-feira e enviada por e-mail para recepção e gestores. Ela dá acesso só à internet.",
      tags: ["wi-fi", "wifi", "visitantes", "senha"],
    },
    {
      id: "KB-007", category: "software", title: "Instalar um software",
      body: "Softwares gratuitos homologados estão no portal de softwares e instalam sozinhos. Licenças pagas precisam de uma requisição aprovada pelo gestor.",
      tags: ["instalar", "software", "licença", "portal"],
    },
    {
      id: "KB-008", category: "hardware", title: "Adicionar uma impressora de rede",
      body: "Em Configurações > Impressoras, clique em Adicionar e escolha a impressora do seu andar (o nome começa com o número do andar).",
      tags: ["impressora", "imprimir", "rede"],
    },
  ];

  return { employees, analysts, tickets, ticketUpdates, kbArticles };
}
