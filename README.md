# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema com as próprias palavras; o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados (sempre depois da confirmação) e chama um analista quando precisa. Cada resposta mostra o que o agent fez e por quê.

Desafio técnico do processo seletivo da Beyond the Bytes.

- **Stack:** TypeScript estrito · Mastra · Next.js · Hono · SQLite (Drizzle) · Vitest
- **Deploy:** https://nexo-assist-adm2.onrender.com (plano gratuito: a primeira abertura depois de um tempo parado leva ~1 min — ver [Deploy](#deploy))
- **Acesso de demonstração** (qualquer senha):
  - Funcionária: `ana.souza@nexo.com.br` (tem um chamado vencido, um reabrível e outros abertos)
  - Analista: `rafael.lima@nexo.com.br` (Suporte N2) · `juliana.costa@nexo.com.br` (Suporte N1)
  - Outros funcionários: `carla.mendes`, `bruno.tavares`, `diego.ramos`, `elisa.prado`, `fabio.nunes`, `gabriela.rocha` (`@nexo.com.br`)

---

## Como rodar

Requisitos: **Node 22+** e **pnpm** (`npm i -g pnpm`). O projeto é um monorepo pnpm; use sempre `pnpm`, não `npm`.

```bash
pnpm install
cp .env.example .env        # preencha a chave do modelo escolhido em LLM_MODEL
pnpm dev                    # api em :3001 e web em http://localhost:3000
```

Na primeira execução os bancos são criados e recebem os dados de exemplo automaticamente.

| Comando | O que faz |
|---|---|
| `pnpm dev` | Sobe api e web em modo desenvolvimento |
| `pnpm test` | Roda os 90 testes (domínio, serviço de chamados, agent e api) |
| `pnpm typecheck` | Checa os tipos dos 4 projetos |
| `pnpm db:seed` | Recria os chamados e funcionários de exemplo (reseta a demonstração) |
| `pnpm chat [email]` | Conversa com o agent no terminal, mostrando ações e decisão |
| `pnpm --filter @nexo/api scenarios [nome]` | Roda conversas roteirizadas contra o modelo real |
| `pnpm build && pnpm start` | Modo produção |

**Modelo:** qualquer provedor suportado pelo Mastra, no formato `provedor/modelo` em `LLM_MODEL`. Só a chave do provedor escolhido é obrigatória; sem ela a aplicação não sobe e diz qual variável falta.

---

## Arquitetura

```
nexo-assist/
├── packages/
│   ├── domain/            Vocabulário e regras do Anexo A: tipos (Zod), prazos em horas/dias úteis,
│   │                      vencimento, reabertura. Funções puras, sem I/O. Não depende de ninguém.
│   └── tickets-service/   O "sistema de chamados legado" simulado: banco próprio, privacidade,
│                          validação do rascunho, duplicidade, central de ajuda, instabilidade.
└── apps/
    ├── api/               Agent (Mastra) + servidor HTTP (Hono) + conversas persistidas.
    └── web/               Next.js: login, chat do funcionário, perfil e console do analista.
```

As dependências só vão em uma direção: `domain` ← `tickets-service` ← `api`; o `web` só conhece o `domain` (tipos e rótulos) e fala com o `api` por HTTP.

```
 navegador ──▶ web (Next) ──/api──▶ api (Hono)
                                      ├─ auth (cookie httpOnly assinado)
                                      ├─ conversas (SQLite app.db) ─ estado: com agent / aguardando / com analista
                                      └─ agent (Mastra) ──ferramentas──▶ tickets-service (SQLite tickets.db)
                                                                         └─ instabilidade simulada + retry
```

Decisões principais:

- **O serviço de chamados é separado do agent** (pacote próprio com banco próprio). O agent só enxerga o que o `index.ts` do serviço exporta; não há como consultar o banco por fora. Hoje é uma biblioteca no mesmo processo; virar microsserviço seria trocar as chamadas de função por HTTP, sem mudar regra nem teste.
- **Regras do service desk em código testado, não no prompt.** Prazos, vencimento, reabertura, privacidade, validação do chamado, duplicidade e "só cria depois de confirmar" são garantidos pelo código. O modelo interpreta a conversa e escolhe a ferramenta.
- **Persistência:** conversas, mensagens, rascunho pendente, transferência e status (com o agent, aguardando atendente, com analista, encerrada) ficam em SQLite e sobrevivem a reinícios. O funcionário volta outro dia e continua a mesma conversa.
- **Tempo real (SSE):** a resposta do agent chega em pedaços, com as ações antes do texto. Além disso, cada tela mantém um canal de avisos aberto (`/api/chat/events` e `/api/console/events`): quando uma conversa muda — analista assumiu, respondeu, devolveu, encerrou; funcionário escreveu; transferência nova —, o servidor avisa "mudou" e a tela busca a conversa pela rota normal, que checa o login. Nenhum dado passa pelo canal, e cada funcionário só recebe avisos das próprias conversas. Escolhi SSE em vez de WebSocket porque só o servidor precisa avisar (o navegador envia por `POST`), o projeto já usa SSE, o `EventSource` reconecta sozinho e não é preciso tratar upgrade de conexão no proxy nem no deploy. Os streams saem com `Cache-Control: no-transform` e `X-Accel-Buffering: no`: sem isso, o proxy do Next compactava o canal com gzip e segurava os avisos no buffer (há um teste para isso).
- **Mesma origem:** o Next repassa `/api` para o servidor do agent; o cookie de sessão fica na origem da página e não é preciso liberar CORS.

---

## Como o agent decide o que fazer

A cada mensagem, o agent (Mastra) recebe as instruções do service desk e o histórico completo da conversa (incluindo as chamadas de ferramenta anteriores) e escolhe entre 9 ferramentas:

| Ferramenta | Quando | O que o código garante |
|---|---|---|
| `record_decision` | Em toda mensagem | Registra o que entendeu, intenção, ação, confiança (0–1) e por quê. Abaixo de 0,5, orienta transferir |
| `search_help_center` | Dúvidas e problemas comuns | Busca com pesos (tag > título > corpo), sem acento |
| `list_my_tickets` / `get_ticket` | Status de chamado | Só os chamados do funcionário logado; prazo e "vencido" calculados pelo domínio |
| `draft_ticket` | Problema que precisa de chamado | Valida os campos do Anexo A; aponta chamado aberto parecido em vez de duplicar; calcula o prazo da primeira resposta |
| `draft_ticket_update` | Complementar ou reabrir | Reabrir só se resolvido há até 7 dias |
| `confirm_pending_action` | Depois do "sim" | **Só executa se a confirmação veio numa mensagem do funcionário posterior ao rascunho** |
| `cancel_pending_action` | Funcionário desiste | Descarta o rascunho |
| `handoff_to_analyst` | Pedido do funcionário, caso crítico, chamado vencido, baixa confiança | Leva o resumo do caso; crítico e vencido vão para o N2, o resto para o N1; depois disso o agent para de responder |

Garantias importantes:

- **A identidade do funcionário nunca vem do modelo.** As ferramentas leem o funcionário da sessão (`requestContext` do Mastra). O modelo não tem como pedir os chamados de outra pessoa; chamado alheio responde como inexistente, para não confirmar nem que ele existe.
- **"Confirmar" no card é uma mensagem do funcionário**, então passa pela mesma trava do `confirm_pending_action`. Num teste com o modelo real, essa trava barrou o modelo quando ele tentou criar o chamado no mesmo turno do rascunho.
- **Agent pausado com analista:** enquanto a conversa está aguardando ou com um analista, as mensagens do funcionário vão para o analista e o agent não é chamado (testado com um agent que falha se for chamado).

### Transparência

Cada resposta traz um registro com duas fontes separadas, de propósito:

- **O que o modelo declara** (`record_decision`): o que entendeu, a intenção, a ação, a confiança e o motivo.
- **O que de fato rodou**, registrado pelo código a partir das ferramentas: "consultou seus chamados", "verificou duplicidade", "classificou a prioridade", "consultou o prazo", "montou o rascunho"… com ✓/✗ e um resumo. O modelo não consegue declarar uma ação que não executou.

Na tela, as ações aparecem acima da resposta conforme acontecem; **"ver decisão"** expande o detalhe (entendeu, ação, barra de segurança, porquê, passos, modelo, tempo e tokens). O console do analista mostra o mesmo detalhe em cada resposta do agent e destaca conversas em que o agent teve confiança baixa ("Agent pediu ajuda · confiança 41%").

Os cards (lista de chamados, card de chamado, rascunho, opções rápidas) são montados pelo código a partir dos dados das ferramentas, nunca do texto do modelo: o que aparece no card é o que está no sistema.

---

## Como garanti a qualidade das decisões

1. **Regras determinísticas com testes** (90 no total, `pnpm test`):
   - **Domínio (21):** prazos com casos de borda — término exatamente às 18h, fim de semana, antes/depois do expediente, crítica em horas corridas, vencido 1 minuto depois do prazo, reabertura com 7 dias exatos vs. 7 dias e 1 minuto. Os testes passam com a máquina em qualquer fuso.
   - **Serviço de chamados (26):** privacidade, numeração, validação do rascunho, duplicidade (a VPN da Ana não é duplicada da VPN do Bruno), complemento que não "zera" o prazo, reabertura, busca na central, instabilidade simulada.
   - **Agent e api (43):** cada ferramenta chamada como o modelo chamaria — confirmação no mesmo turno recusada, duplicado apontado, chamado alheio não encontrado, transferência para o time certo, confiança baixa orientando transferência; regras de exibição dos cards; rastro legível; retry com backoff; transições de estado do console; avisos em tempo real só para o dono da conversa; limites de uso.
2. **Testes que falham quando deveriam.** Sabotei o código de propósito (expediente até 17h; filtro de dono do chamado removido) e confirmei que os testes quebram.
3. **Cenários com o modelo real** (`pnpm --filter @nexo/api scenarios`): dúvida pela central, consulta de status, abertura com rascunho, fora do escopo, privacidade e transferência, imprimindo as decisões. Foi assim que encontrei e corrigi um problema real: com o histórico só em texto, o modelo "esquecia" o rascunho mostrado e montava outro ao receber o "pode criar"; hoje o histórico guarda as chamadas de ferramenta.
4. **Falhas do modelo tratadas como erro.** O Mastra sinaliza erro do provedor, cota estourada, demora e resposta vazia como eventos, sem lançar. Cada caso vira um erro tipado; nada é gravado e a tela oferece "Tentar de novo". Há limite de 60 s por mensagem.

---

## Escolha do modelo e custo

O código não depende de provedor: o modelo é uma string no `.env` (`provedor/modelo`, via o roteador de modelos do Mastra).

- **Padrão do `.env.example`: `google/gemini-3.5-flash`**, porque tem plano gratuito e bom uso de ferramentas — dá para rodar sem cartão.
- **Limitação real do plano gratuito:** cerca de 5 requisições por minuto e 20 por dia. Cada mensagem gasta de 2 a 3 requisições (ferramenta + resposta), então dá para poucas conversas por dia. Por isso, **para o deploy e para avaliar com calma, recomendo `anthropic/claude-haiku-5-5`**: rápido, bom em ferramentas e barato.
- **Medido:** uma pergunta simples gastou ~4.800 tokens de entrada e ~500 de saída (instruções + 9 ferramentas + histórico). Com o Haiku 5.5 (US$ 0,10 / 0,50 por milhão), isso dá menos de US$ 0,001 por mensagem; uma conversa de 10 mensagens fica na ordem de 1 centavo de dólar (estimativa — o histórico cresce a cada mensagem).

O que reduz custo por conversa:

- Prompt do sistema estável (sem data nem nome), para o provedor reaproveitar o cache do prefixo.
- Regras e cálculos no código: o modelo recebe prazos e "vencido" prontos, em vez de raciocinar sobre calendário.
- `record_decision` vai junto com as outras ferramentas, sem requisição extra quando já há ferramenta no turno.
- No máximo 6 idas e voltas modelo↔ferramenta por mensagem, 30 mensagens por conversa, 2.000 caracteres por mensagem.

---

## Resiliência: o sistema de chamados legado

O PRD diz que o sistema de chamados fica indisponível por alguns segundos de vez em quando. O `tickets-service` simula isso (`TICKETS_OUTAGE_RATE`, `TICKETS_OUTAGE_MS`): o sistema cai em janelas e, depois de voltar, fica estável por um tempo. Do lado do api, cada chamada tem **retry com backoff exponencial e jitter** (~300, 600, 1200 ms) só para indisponibilidade — "não encontrado" ou "rascunho inválido" falham na hora. Se ainda assim falhar, o agent diz que o sistema está instável em vez de fingir que deu certo. `pnpm --filter @nexo/api demo:outages` mostra isso acontecendo.

---

## Segurança e privacidade

- Chaves só no `.env` (fora do Git); `.env.example` sem valores.
- Sessão em cookie **httpOnly, assinado** e `Secure` em produção; cookie adulterado é rejeitado. Em produção, a aplicação não sobe sem um `SESSION_SECRET` próprio.
- Chamados de um funcionário nunca chegam a outro: o filtro por dono está no serviço, e o funcionário vem da sessão, não do modelo. Funcionário não acessa o console.
- Entrada validada com Zod; texto do modelo renderizado sem HTML bruto.
- Limites de uso: mensagens por funcionário (20 a cada 10 min), teto diário de mensagens da aplicação (500) e tentativas de login por IP (10/min), todos configuráveis.

---

## Deploy

Publicado no **Render** (plano gratuito) com os bancos no **Turso** (LibSQL gerenciado, plano gratuito).

Uma imagem Docker com api e web (`Dockerfile` na raiz). Só o web é exposto; ele repassa `/api` para o api dentro do container. Os bancos são LibSQL, então o mesmo código usa um arquivo local em desenvolvimento e um banco remoto em produção — só muda a URL. Isso dispensa disco persistente na plataforma, que o plano gratuito do Render não oferece.

Como foi feito:

1. **Turso:** dois bancos, `nexo-tickets` e `nexo-app` (um por serviço, porque cada um tem a própria tabela de controle de migrations).
2. **Render:** Web Service a partir do repositório, runtime Docker, health check em `/api/health`. Cada push na `main` gera um novo deploy.
3. **Variáveis** (só no painel do Render, nunca no repositório): `LLM_MODEL`, a chave do provedor (`GOOGLE_GENERATIVE_AI_API_KEY` ou `ANTHROPIC_API_KEY`), `SESSION_SECRET` (32+ caracteres), `TICKETS_DB_URL` e `APP_DB_URL` no formato `libsql://<banco>.turso.io?authToken=<token>`.
4. Na primeira subida, as migrations criam as tabelas e os dados de exemplo entram sozinhos.

Proteção de custo: além dos limites da aplicação (mensagens por funcionário, teto diário e tentativas de login), o ideal é definir um teto de gasto no console do provedor do modelo.

**Observação:** no plano gratuito o Render desliga o serviço após ~15 minutos sem acesso; a primeira abertura depois disso leva cerca de 1 minuto.

Em outra plataforma com Docker (Fly.io, Railway…), dá para usar SQLite em arquivo montando um volume em `/app/data`, sem definir `TICKETS_DB_URL` e `APP_DB_URL`.

---

## Principais trade-offs

- **Uma instância só:** os bancos (LibSQL no Turso) já aguentam várias instâncias, mas os limites de uso e os avisos em tempo real ficam em memória. Para escalar horizontalmente, eles iriam para um Redis.
- **Avisos em tempo real em memória:** funcionam para uma instância. Com várias instâncias, o aviso precisaria passar por um Redis pub/sub (ou similar) para chegar a quem está conectado em outra instância.
- **Busca na central por palavras-chave**, sem embeddings: com 8 artigos acerta e não custa nada; não entende sinônimos.
- **Confiança declarada pelo próprio modelo:** é útil para destacar casos duvidosos, mas não é calibrada.
- **Login sem senha real** (qualquer senha para os dados de exemplo), como o PRD permite; o cookie e a separação funcionário/analista são reais.
- **Prazos sem feriados** e com fuso fixo UTC−3 (o Brasil não tem horário de verão desde 2019).
- **Histórico completo enviado ao modelo** a cada mensagem: mantém o contexto (inclusive o rascunho mostrado), mas o custo cresce ao longo da conversa — o limite de 30 mensagens segura isso.

## O que faria com mais tempo

- **Avaliação automática das decisões:** um conjunto de conversas rotuladas (intenção, ferramenta, prioridade esperada) rodando a cada mudança de prompt ou de modelo, com a taxa de acerto no CI.
- Resumir ou cortar resultados antigos de ferramentas no histórico para baratear conversas longas.
- Busca semântica na central de ajuda e artigos gerenciáveis pelos analistas.
- Feriados no cálculo de prazo e prazos vencendo destacados proativamente no console.
- Autenticação corporativa real (SSO) e auditoria das ações dos analistas.
- Testes de interface (Playwright) para os fluxos principais.
