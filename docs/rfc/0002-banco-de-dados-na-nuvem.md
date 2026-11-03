# RFC 0002 — Banco de dados na nuvem

| | |
|---|---|
| **Status** | Aceita e implementada |
| **Data** | Proposta no planejamento da Fase 3 (outubro de 2026); registrada em 2026-10-30 |
| **Decisões que nasceram daqui** | [ADR 0001](../adr/0001-escolha-do-banco-de-dados.md) (atualização da Fase 3), [ADR 0004](../adr/0004-ambientes-no-mesmo-cluster.md) |
| **Documento de apoio** | [`banco-de-dados.md`](../banco-de-dados.md): justificativa formal e diagrama ER |

## Resumo

Na Fase 2 o PostgreSQL rodava dentro do Kubernetes. Esta RFC propõe levá-lo para o **Amazon RDS
for PostgreSQL**, mantendo o mesmo banco e o mesmo modelo, e define como homologação, produção
e a Lambda de autenticação vão usá-lo.

## Problema

- O enunciado da Fase 3 pede banco **gerenciado**, criado por Terraform num repositório próprio.
- Um Postgres em StatefulSet some junto com o cluster a cada destroy, e backup, atualização e
  disco ficam por nossa conta.
- A nova Lambda `auth-cpf` precisa ler o cadastro de clientes.
- Os dois ambientes (homologação e produção) precisam de dados separados, dentro do orçamento do
  Learner Lab.

## Critérios

1. **Modelo de dados:** o domínio é relacional e depende de transações (ver ADR 0001).
2. **Mudança no código:** quanto menos, melhor; o app usa Prisma com PostgreSQL.
3. **Custo** por hora no Learner Lab.
4. **Operação:** backup, atualização e disco gerenciados.
5. **Acesso pela Lambda** sem expor o banco à internet.

## Opções

| Critério | **RDS PostgreSQL** | Aurora PostgreSQL Serverless v2 | Postgres no EKS (StatefulSet) | DynamoDB |
|---|---|---|---|---|
| Modelo | Relacional, igual ao atual | Relacional, compatível | Relacional, igual ao atual | Chave-valor/documento |
| Mudança no código | Nenhuma (só a `DATABASE_URL`) | Nenhuma | Nenhuma | Reescrever a persistência inteira |
| Custo | Menor instância (`db.t3.micro`) | Cobra uma capacidade mínima por hora, acima do `db.t3.micro` | Só o disco, mas ocupa os nós do cluster | Por requisição, baixo |
| Gerenciado | Backup, patch e disco | Backup, patch, disco e escala | Não: tudo por nossa conta | Sim |
| Sobrevive ao destroy do cluster | Sim, é outro repositório | Sim | Não | Sim |

- **Aurora Serverless v2** escala sozinho, mas a capacidade mínima custa mais que a menor
  instância do RDS, e o projeto não tem carga que justifique.
- **Postgres no EKS** é o desenho da Fase 2 e não atende o pedido de banco gerenciado.
- **DynamoDB** exigiria remodelar um domínio relacional (agregado com orçamentos, linhas,
  estoque com reserva atômica) e abrir mão das transações que o ADR 0001 justifica.

## Proposta

1. **RDS PostgreSQL 16, `db.t3.micro`, 20 GB gp3**, criado no repositório `oficina-infra-db`.
2. **Sem acesso público.** O banco fica na VPC do cluster, com security group que só aceita os
   nós do EKS e as Lambdas.
3. **Disco criptografado** e backup automático.
4. **Um schema por ambiente** no mesmo banco: `homolog` e `prod`, escolhidos pela `DATABASE_URL`
   (`?schema=<ambiente>`). O Prisma cria o schema na primeira migration.
5. **Usuário só de leitura para a Lambda:** `oficina_auth`, com `SELECT` só na tabela `cliente`
   dos dois schemas.
6. **Migrations num Job do Kubernetes** antes de a API subir, para as várias réplicas do HPA não
   migrarem o banco ao mesmo tempo.

### Configuração de laboratório × produção real

| Item | Laboratório (agora) | Produção real |
|---|---|---|
| Alta disponibilidade | Uma zona (`multi_az = false`) | Multi-AZ |
| Ao destruir | Sem snapshot final, sem proteção contra exclusão | Snapshot final e `deletion_protection` |
| Ambientes | Um banco, dois schemas | Um banco por ambiente |
| Credenciais | Senha nos Secrets do GitHub | Secrets Manager com rotação |

## Riscos

- **Homologação e produção no mesmo banco:** um erro de configuração pode apontar um ambiente para
  o schema do outro. Mitigação: o schema vem do nome do namespace, montado pelo pipeline.
- **A Lambda conhece a tabela `cliente`:** mudar essas colunas exige ajustar o
  `oficina-lambda-auth` junto (ver [ADR 0002](../adr/0002-padrao-de-comunicacao.md)).
- **Dados somem a cada destroy** no laboratório. Aceitável: o seed recria o necessário e o
  histórico de observabilidade fica no New Relic.

## Decisão

Aceita. O banco continua PostgreSQL, agora no RDS (atualização da Fase 3 no ADR 0001), com um
schema por ambiente (ADR 0004).
