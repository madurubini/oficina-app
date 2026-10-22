
# ADR 0001 — Escolha do banco de dados: PostgreSQL

- **Status:** Aceita (atualizada na Fase 3: Postgres gerenciado no Amazon RDS)
- **Data:** 2026-06-27 · atualização 2026-10-21
- **Contexto da decisão:** Requisito técnico do Tech Challenge — "a escolha do
  banco de dados é livre, mas é necessário justificar a preferência pelo banco
  utilizado".

## Contexto

O sistema é um **monolito modular em DDD** (NestJS + Prisma), organizado por
contextos delimitados, com um **único banco** compartilhado. O núcleo é o
agregado **Ordem de Serviço**, que carrega invariantes fortes e exige garantias
de consistência:

- **Transações multi-tabela**: ao persistir a OS, o repositório trata o agregado
  como fonte de verdade e, dentro de uma transação, **apaga e recria** os filhos
  (histórico, orçamentos e suas linhas), respeitando a ordem de chaves
  estrangeiras (ver `prisma-ordem-servico.repositorio.ts`).
- **Concorrência sem corrida**: a reserva de peças usa um **UPDATE condicional
  atômico** (`UPDATE peca SET reservado = reservado + N WHERE saldoFisico -
  reservado >= N`), que impede dupla reserva sob acesso simultâneo
  (`prisma-peca.repositorio.ts`).
- **Optimistic lock**: a OS é atualizada com `WHERE id = ? AND versao = ?`,
  detectando escrita concorrente e lançando conflito.
- **Dinheiro exato**: preços congelados e totais usam `Decimal(10,2)` — sem ruído
  de ponto flutuante.
- **Integridade referencial**: cliente↔veículo↔OS↔orçamento↔linhas↔estoque são
  relações bem definidas, que se beneficiam de FKs e constraints no banco.

As forças em jogo: consistência transacional ACID, modelo claramente
**relacional**, suporte a tipos exatos (decimal), concorrência segura,
maturidade do ecossistema e custo zero de licença para um MVP.

## Decisão

Adotar **PostgreSQL** como banco de dados, acessado via **Prisma ORM**.

Justificativa:

1. **ACID e transações robustas** — atende diretamente o padrão de persistência
   do agregado (apaga/recria filhos numa transação) e o optimistic lock.
2. **Modelo relacional aderente ao domínio** — os agregados e suas relações são
   naturalmente tabelas com FKs; constraints e índices (`@@index([status])`,
   `unique` em código de peça/placa/CPF) protegem invariantes no próprio banco.
3. **Tipos precisos** — `NUMERIC/DECIMAL` nativo para dinheiro; `uuid` nativo
   para chaves; bom suporte a data/hora.
4. **Concorrência** — MVCC e UPDATE condicional permitem a reserva atômica sem
   travar a aplicação inteira nem depender de lock pessimista.
5. **Maturidade e ecossistema** — driver estável, ótimo suporte no Prisma,
   ferramentas de migração, e roda trivialmente em Docker (já no
   `docker-compose.yml`).
6. **Custo e portabilidade** — open source, sem licença, fácil de subir local e
   em qualquer cloud.

## Alternativas consideradas

- **MySQL/MariaDB** — também relacional e ACID, atenderia. Descartado por
  preferência: o suporte do Postgres a tipos (uuid, decimal, JSONB), a tipos
  ricos e a recursos avançados (índices parciais, CTEs) é superior, e a
  integração Prisma + Postgres é a mais madura. Decisão de afinidade, não de
  impedimento técnico.
- **MongoDB (documentos)** — atraente para "carregar o agregado inteiro" como um
  documento. Descartado porque o domínio é **fortemente relacional** (relatórios,
  consultas por status/cliente, integridade entre contextos) e porque as
  garantias transacionais e de consistência que o núcleo exige são mais simples e
  naturais num banco relacional. Modelar FKs e joins em documentos traria
  complexidade desnecessária para este MVP.
- **SQLite** — ótimo para testes locais, mas inadequado para concorrência real
  (escrita serializada) e para um ambiente containerizado multiusuário.

## Consequências

**Positivas**
- Consistência transacional forte alinhada às invariantes do agregado.
- Reserva de estoque segura sob concorrência, sem lock pessimista.
- Integridade garantida pelo banco (FKs, unique, índices), além das regras de
  domínio.
- Operação simples via Docker; mesmo banco em dev e produção.

**Negativas / trade-offs**
- Acoplamento ao dialeto Postgres em pontos pontuais (ex.: o `$executeRaw` da
  reserva atômica usa sintaxe SQL Postgres) — trocar de banco exigiria revisar
  esse trecho.
- Banco relacional exige migrações disciplinadas ao evoluir o schema (mitigado
  pelo fluxo do Prisma e pela cópia documental em `docs/schema.prisma`).
- Para escalar escrita no futuro, seria preciso estratégia de réplica/sharding —
  fora do escopo do MVP.

## Notas de implementação

- ORM: Prisma (`prisma/schema.prisma`, cópia documental em `docs/schema.prisma`).
- Container: serviço `db` no `docker-compose.yml` (Postgres exposto na porta
  `5433` no host).
- Dinheiro em `Decimal(10,2)`; chaves em `uuid`; histórico de status e versão
  (optimistic lock) modelados explicitamente.

## Atualização — Fase 3 (2026-10-21)

O banco continua **PostgreSQL** (mesma versão major, 16), mas deixa de rodar como StatefulSet no
Kubernetes e passa a ser **gerenciado pelo Amazon RDS** (`db.t3.micro`, sem IP público, acesso só do
cluster EKS e das Lambdas). Homologação e produção ficam em **schemas** separados do mesmo database.

A justificativa formal da escolha, o diagrama ER, a explicação dos relacionamentos e os ajustes no
modelo relacional estão em [`docs/banco-de-dados.md`](../banco-de-dados.md). A infraestrutura está
no repositório [`oficina-infra-db`](https://github.com/madurubini/oficina-infra-db).
