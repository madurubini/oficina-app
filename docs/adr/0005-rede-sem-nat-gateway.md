# ADR 0005 — Rede sem NAT Gateway

- **Status:** Aceita
- **Data:** 2026-10-29 (registro de decisão tomada no planejamento da Fase 3)
- **Contexto da decisão:** custo no Learner Lab (US$ 50 para a fase inteira).

## Contexto

O desenho mais comum na AWS põe os nós e o banco em **subnets privadas** e dá acesso à internet
por um **NAT Gateway**. Os nós precisam de internet para baixar imagens (ECR) e falar com o
control plane do EKS e com o New Relic.

O NAT Gateway é cobrado por hora (cerca de US$ 0,045/h em `us-east-1`, mais o tráfego), ligado ou
não, e um por zona para ter alta disponibilidade. Na rotina de subir, estudar e derrubar, ele seria
um dos maiores custos da fase.

## Decisão

A VPC do repositório [`oficina-infra-k8s`](https://github.com/madurubini/oficina-infra-k8s) tem
**só subnets públicas** (2, em 2 zonas), com Internet Gateway e **sem NAT**:

- os **nós do EKS** ficam nas subnets públicas, com IP público, e saem para a internet direto pelo
  Internet Gateway;
- o **RDS** fica nas mesmas subnets, mas **sem acesso público** (`publicly_accessible = false`) e
  com security group que só aceita o cluster e as Lambdas;
- a **λ `auth-cpf`** entra na VPC só para alcançar o RDS. Ela não tem saída para a internet, e
  não precisa: recebe a senha do banco e o segredo do JWT como variáveis de ambiente (parâmetros
  `NoEcho` do SAM).

## Alternativas consideradas

- **Subnets privadas + NAT Gateway.** O padrão para produção. Descartado pelo custo fixo por hora.
- **Subnets privadas + VPC endpoints** (ECR, S3, STS, CloudWatch...). Evita o NAT, mas cada
  endpoint de interface também é cobrado por hora e por zona, e são vários.
- **NAT Instance** (uma EC2 fazendo NAT). Mais barata que o NAT Gateway, mas é mais uma máquina
  para manter e um ponto único de falha.

## Consequências

**Positivas**
- Nenhum custo fixo de rede além do que o próprio EKS e o RDS cobram.
- Menos peças para subir e derrubar a cada sessão do Lab.

**Negativas / trade-offs**
- **Os nós têm IP público.** Eles ficam protegidos pelo security group do EKS (não aceitam conexão
  de fora), mas a superfície é maior que em subnet privada.
- **A Lambda na VPC não alcança a internet nem as APIs da AWS.** Por isso não dá para ler segredos
  do Secrets Manager em tempo de execução sem acrescentar um VPC endpoint.
- Em produção real, a recomendação seria voltar ao desenho com subnets privadas e NAT (ou
  endpoints). A mudança fica concentrada no repositório da rede.
