# Decisões de arquitetura (ADRs)

Cada ADR registra uma decisão já tomada: o contexto, o que foi decidido, as alternativas
descartadas e as consequências. Uma decisão nova que substitua outra ganha um ADR novo, e o antigo
passa a apontar para ele.

| # | Decisão | Fase |
|---|---|---|
| [0001](0001-escolha-do-banco-de-dados.md) | PostgreSQL como banco (gerenciado no RDS na Fase 3) | 1 e 3 |
| [0002](0002-padrao-de-comunicacao.md) | HTTP síncrono pelo API Gateway, sem mensageria entre as peças | 3 |
| [0003](0003-escalabilidade-com-hpa.md) | Escalabilidade horizontal com HPA por CPU e memória | 2 e 3 |
| [0004](0004-ambientes-no-mesmo-cluster.md) | Homologação e produção no mesmo cluster e no mesmo banco | 3 |
| [0005](0005-rede-sem-nat-gateway.md) | Rede só com subnets públicas, sem NAT Gateway | 3 |
| [0006](0006-aws-sam-para-as-lambdas.md) | AWS SAM para o Gateway e as Lambdas | 3 |
| [0007](0007-observabilidade-com-new-relic.md) | Observabilidade com New Relic | 3 |
