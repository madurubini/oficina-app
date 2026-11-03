# ADR 0004 — Homologação e produção no mesmo cluster e no mesmo banco

- **Status:** Aceita
- **Data:** 2026-10-29 (registro de decisão tomada no planejamento da Fase 3)
- **Contexto da decisão:** o enunciado pede deploy automático em homologação e produção; o
  Learner Lab tem saldo de US$ 50 para a fase inteira.

## Contexto

Cada ambiente precisa de app, banco e Gateway próprios, com dados separados. Duplicar toda a
infraestrutura dobraria o custo: dois clusters EKS (o control plane é cobrado por hora), duas
instâncias RDS e o dobro de nós.

## Decisão

Um **cluster EKS** e uma **instância RDS** para os dois ambientes, separados assim:

| Camada | Homolog | Prod |
|---|---|---|
| Kubernetes | namespace `homolog` | namespace `prod` |
| Banco | schema `homolog` (`?schema=homolog` na `DATABASE_URL`) | schema `prod` |
| Load Balancer | um, do Service do namespace | um, do Service do namespace |
| API Gateway | stack `oficina-auth-homolog` | stack `oficina-auth-prod` |
| Branch que publica | `homolog` | `main` |

A infraestrutura compartilhada (rede, cluster, banco) é aplicada pelas duas branches no mesmo
state do Terraform; o que é de cada ambiente (pods, Gateway, schema) é publicado pela branch
correspondente.

## Alternativas consideradas

- **Dois clusters e dois RDS.** Isolamento total, mas dobra o custo fixo por hora e o tempo de
  subir e derrubar o ambiente a cada sessão do Lab.
- **Um RDS com dois databases** em vez de dois schemas. Também funciona; o schema foi escolhido
  porque o Prisma o cria sozinho na primeira migration, sem passo manual no banco.
- **Só produção na nuvem**, com homologação local. Não atende o enunciado, que pede o deploy
  automático dos dois ambientes.

## Consequências

**Positivas**
- Custo de um ambiente só, com os dois ambientes de fato separados em pods, dados, URL e Gateway.
- Homolog roda na mesma infraestrutura de prod: o que passa em homolog tende a passar em prod.

**Negativas / trade-offs**
- **Isolamento menor.** Os pods dos dois ambientes dividem os mesmos nós; um pico em homolog pode
  tirar CPU de prod. Os `requests` e `limits` do `Deployment` reduzem esse risco.
- **Credencial compartilhada.** O app dos dois ambientes usa o mesmo usuário administrador do
  banco, e o `oficina_auth` da Lambda lê a tabela `cliente` dos dois schemas. Um erro de
  configuração pode apontar homolog para o schema de prod.
- **Mudanças na infraestrutura compartilhada valem para os dois** assim que entram em `homolog`.
  Por isso os repositórios de infraestrutura exigem o check do `terraform plan` no PR.
