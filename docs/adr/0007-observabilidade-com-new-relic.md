# ADR 0007 — Observabilidade com New Relic

- **Status:** Aceita
- **Data:** 2026-10-29 (registro de decisão tomada no planejamento da Fase 3)
- **Contexto da decisão:** o enunciado pede latência, CPU e memória, health e uptime, alertas,
  logs estruturados com correlation id e dashboards.

## Contexto

O ambiente na AWS é **destruído ao fim de cada sessão** do Learner Lab. A ferramenta de
monitoramento precisa guardar o histórico entre sessões, cobrir app e cluster, e caber no
orçamento (que já está todo na AWS).

## Decisão

Usar o **New Relic**, no plano gratuito:

- **APM** com o agente Node no app (`node -r newrelic`), ligado no Kubernetes pelo ConfigMap e
  desligado por padrão no desenvolvimento local;
- **logs em JSON** (`nestjs-pino`) com o `requestId`, que vem do `x-request-id` do API Gateway;
- **eventos de negócio** `OrdemServicoStatus` e `FalhaIntegracao`, base dos dashboards;
- **integração Kubernetes** (`nri-bundle`, namespace `newrelic`) para CPU, memória e pods;
- **alertas** NRQL com aviso por e-mail e **monitor de uptime** (ping no `/health`).

Os detalhes de cada sinal, do dashboard e dos alertas estão em
[`observabilidade.md`](../observabilidade.md).

## Alternativas consideradas

- **CloudWatch.** Já está na conta da AWS e recebe os logs das Lambdas. Mas os dados ficam presos
  à conta do Lab, o APM (Application Signals) e as métricas de contêiner (Container Insights) são
  cobrados à parte, e montar tracing e dashboards de negócio dá bem mais trabalho.
- **Prometheus + Grafana dentro do cluster.** Sem custo de licença, mas consome os mesmos 2 nós
  da aplicação e **perde o histórico a cada destroy**, que é exatamente o que precisamos guardar.
  Faltaria ainda APM e logs (Loki, Tempo...).
- **Datadog.** Completo, mas o trial acaba em 14 dias e a fase dura mais que isso.

## Consequências

**Positivas**
- O histórico sobrevive à destruição do ambiente: dá para comparar sessões e montar o dashboard
  antes da gravação.
- APM, logs, eventos, Kubernetes, alertas e uptime no mesmo lugar, ligados pelo `requestId`.
- Plano gratuito sem prazo, com franquia de dados mensal que sobra para o volume do projeto.
- O agente envia em segundo plano: se o New Relic cair, a API segue funcionando.

**Negativas / trade-offs**
- **Dependência de um serviço externo** e de mais um segredo (`NEW_RELIC_LICENSE_KEY`) no
  pipeline.
- Os dashboards e os alertas são configurados no painel do New Relic, fora do Git. O dashboard
  está exportado em `observabilidade/dashboard.json` e os alertas descritos em
  `observabilidade.md`, para poderem ser recriados.
- O agente APM acrescenta um pouco de CPU e memória por pod, o que entra na conta do HPA.
- Os logs das Lambdas continuam no CloudWatch (7 dias); o New Relic cobre o app e o cluster.
