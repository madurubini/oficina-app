# RFC 0001 — Escolha do provedor de nuvem

| | |
|---|---|
| **Status** | Aceita e implementada |
| **Data** | Proposta no planejamento da Fase 3 (outubro de 2026); registrada em 2026-10-30 |
| **Decisões que nasceram daqui** | [ADR 0004](../adr/0004-ambientes-no-mesmo-cluster.md), [ADR 0005](../adr/0005-rede-sem-nat-gateway.md), [ADR 0006](../adr/0006-aws-sam-para-as-lambdas.md) |

## Resumo

Levar o sistema da oficina para uma nuvem pública, com Kubernetes gerenciado, banco gerenciado,
API Gateway e função serverless. A proposta é usar a **AWS, pelo Learner Lab da FIAP**, e
organizar a infraestrutura para subir e derrubar a cada sessão de trabalho.

## Problema

Na Fase 2 o sistema rodava num Kubernetes local (minikube), com o Postgres dentro do cluster. A
Fase 3 pede:

- um **API Gateway** como porta de entrada;
- uma **função serverless** que autentica o cliente pelo CPF;
- **Kubernetes** e **banco** gerenciados, criados por Terraform;
- deploy automático em homologação e produção, a partir do GitHub.

Tudo isso precisa existir num provedor de nuvem, dentro de um orçamento pequeno e sem cartão de
crédito pessoal.

## Critérios

1. **Custo para a aluna:** usar o crédito que o curso fornece, sem cartão próprio.
2. **Serviços necessários:** Kubernetes gerenciado, Postgres gerenciado, API Gateway com
   autorizador customizado e funções serverless em Node.js.
3. **Material do curso:** as aulas de Serverless e o Terraform da Fase 2 servem de base.
4. **Ferramentas:** provider de Terraform maduro e ferramenta de deploy das funções.
5. **Restrições do ambiente:** o que a conta de estudante não permite.

## Opções

| Critério | **AWS (Learner Lab)** | Azure | Google Cloud |
|---|---|---|---|
| Crédito | US$ 50 do Learner Lab, fornecido pela FIAP | Exige conta própria ou programa de estudante, fora do que o curso fornece | Exige conta própria (trial com cartão) |
| Kubernetes | EKS | AKS | GKE |
| Postgres gerenciado | RDS | Azure Database for PostgreSQL | Cloud SQL |
| Gateway + autorizador | API Gateway HTTP API + Lambda Authorizer | API Management (políticas) | API Gateway / Apigee |
| Serverless | Lambda (Node.js 22) | Azure Functions | Cloud Functions / Cloud Run |
| Material do curso | Aulas de Serverless e de Terraform/EKS em AWS | — | — |
| Deploy das funções | AWS SAM, usado nas aulas | Azure Functions Core Tools | gcloud |

As três nuvens têm os serviços necessários. O que desempata é **custo** e **material do curso**:
só a AWS vem com crédito fornecido e com aulas que cobrem exatamente essas peças.

## Proposta

Usar a **AWS pelo Learner Lab**, com:

- **EKS** para a API, **RDS PostgreSQL** para o banco e **ECR** para as imagens;
- **API Gateway (HTTP API)** com **Lambda Authorizer** e a **Lambda `auth-cpf`**, descritos em SAM;
- **Terraform** para rede, cluster e banco, com o state num bucket S3;
- infraestrutura dividida em 4 repositórios (rede/cluster, banco, aplicação e Lambdas).

### Restrições do Learner Lab e como a proposta lida com elas

| Restrição | Consequência no desenho |
|---|---|
| **Crédito de US$ 50 para a fase inteira** | Rotina de subir, testar e **derrubar** a cada sessão; rede sem NAT Gateway ([ADR 0005](../adr/0005-rede-sem-nat-gateway.md)); um cluster e um banco para os dois ambientes ([ADR 0004](../adr/0004-ambientes-no-mesmo-cluster.md)) |
| **Sessão de cerca de 4 horas**, com credenciais novas a cada sessão | As credenciais ficam nos *Secrets* do GitHub e são atualizadas a cada sessão; nada depende de a sessão continuar aberta |
| **Não dá para criar roles do IAM** | EKS, nós e Lambdas usam a role pronta `LabRole`; sem Cluster Autoscaler nem AWS Load Balancer Controller |
| **Estourar o saldo pode encerrar a conta** | Destroy manual em todos os pipelines e ordem de derrubada documentada |

### Estimativa de custo

Valores aproximados de `us-east-1`, por hora com tudo ligado:

| Recurso | Custo aproximado |
|---|---|
| Control plane do EKS | US$ 0,10/h |
| 2 nós `t3.medium` | 2 × US$ 0,04/h |
| RDS `db.t3.micro` | US$ 0,02/h |
| 2 Load Balancers, Gateway, Lambdas, ECR, S3 | centavos por sessão |
| **Total** | **cerca de US$ 0,25 a 0,30/h** |

Ligado o tempo todo, o crédito acabaria em pouco mais de uma semana. Derrubando ao fim de cada
sessão, ele rende perto de 170 horas de uso, o bastante para a fase inteira e a gravação.

## Riscos

- **Esquecer o ambiente ligado** consome o saldo. Mitigação: derrubar ao fim de cada sessão e
  conferir no console (EKS, RDS, EC2, Load Balancers).
- **Diferenças do Learner Lab em relação a uma conta normal** (permissões de IAM, KMS). O desenho
  evita depender delas; em produção real alguns pontos mudariam (subnets privadas com NAT,
  roles próprias, logs do control plane).
- **Dependência de um único provedor.** A aplicação é um contêiner comum e o banco é Postgres
  padrão; o que fica preso à AWS é a camada de infraestrutura (Terraform e SAM).

## Decisão

Aceita. A AWS foi adotada pelo Learner Lab, e as escolhas de custo viraram os ADRs 0004, 0005 e
0006.
