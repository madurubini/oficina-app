# ─────────────── Estágio 1: build ───────────────
FROM node:20-slim AS builder

# openssl é exigido pelo engine do Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build
# Compila o seed (fora do build do Nest) para rodar no container sem ts-node
RUN npx tsc prisma/seed.ts --outDir dist/prisma --module commonjs \
    --target ES2021 --esModuleInterop --skipLibCheck --resolveJsonModule

# ─────────────── Estágio 2: runtime ───────────────
FROM node:20-slim AS runner

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
# Cliente Prisma já gerado (a CLI prisma vem como dependência de produção)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# node_modules continua pertencendo ao root: a aplicação não reescreve as
# próprias dependências em tempo de execução.
USER node

EXPOSE 3000

# Agente do New Relic: configurado só por variáveis de ambiente, desligado por
# padrão (sem conta, a API sobe igual). No Kubernetes, o ConfigMap o liga e o
# Secret traz a license key. O log do próprio agente vai para a saída padrão.
ENV NEW_RELIC_ENABLED=false \
    NEW_RELIC_NO_CONFIG_FILE=true \
    NEW_RELIC_LOG=stdout \
    NEW_RELIC_LOG_LEVEL=warn

# Só inicia a API. Migrar o banco é de quem orquestra: docker-entrypoint.sh no
# Compose, Job de migrations no Kubernetes. O `-r newrelic` carrega o agente
# antes de tudo, para ele instrumentar HTTP, Prisma e os logs.
CMD ["node", "-r", "newrelic", "dist/main"]
