#!/bin/sh
set -e

echo "Aplicando migrations versionadas (prisma migrate deploy)..."
npx prisma migrate deploy

echo "Rodando seed (idempotente)..."
node dist/prisma/seed.js

echo "Iniciando a API..."
exec node -r newrelic dist/main
