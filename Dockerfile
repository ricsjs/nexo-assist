# Uma imagem com o api (agent) e o web (Next). Só o web é exposto; ele repassa /api
# para o api dentro do próprio container. Os bancos SQLite ficam em /app/data:
# monte um volume ali para as conversas e os chamados sobreviverem a um novo deploy.
FROM node:22-slim

WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

ENV NODE_ENV=production \
    API_PORT=3001 \
    TICKETS_DB_URL=file:/app/data/tickets.db \
    APP_DB_URL=file:/app/data/app.db
RUN mkdir -p /app/data
VOLUME ["/app/data"]

# A plataforma define PORT para o serviço público; o Next usa essa variável (padrão 3000).
EXPOSE 3000
CMD ["pnpm", "start"]
