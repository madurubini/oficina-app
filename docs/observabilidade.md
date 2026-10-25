# Observabilidade (New Relic)

O que a Oficina mede, onde cada dado nasce e como montar os painéis e alertas.

## Visão geral

```
                 x-request-id = requestId do Gateway
Cliente ──► API Gateway ──────────────────────────► oficina-api (pod no EKS)
                                                     │  agente New Relic (node -r newrelic)
                                                     ├─ traces e métricas das requisições (APM)
                                                     ├─ logs JSON (pino), com requestId e trace.id
                                                     ├─ evento OrdemServicoStatus a cada mudança de status
                                                     └─ evento FalhaIntegracao quando uma integração falha
nri-bundle (namespace newrelic) ── CPU, memória, pods, HPA e eventos do cluster
```

| Dado | De onde vem | Tipo no New Relic |
|---|---|---|
| Latência, vazão e erros por rota | Agente APM (Express + Prisma instrumentados) | `Transaction`, `TransactionError` |
| Trace de cada requisição (rota → caso de uso → SQL) | Agente APM (distributed tracing) | `Span` |
| Logs da aplicação | pino → agente (encaminhamento de logs) | `Log` |
| Mudanças de status da OS | `EventosDeNegocio` (`src/observabilidade`) | `OrdemServicoStatus` |
| Falhas de integração (serviço de notificações) | Adaptador `NotificadorSimulado` | `FalhaIntegracao` |
| CPU/memória de pods e nós, réplicas | Integração Kubernetes (`nri-bundle`) | `K8sContainerSample`, `K8sDeploymentSample`… |

## O requestId

Cada requisição tem um id, e o mesmo valor aparece em quatro lugares:

1. Na resposta, no cabeçalho `x-request-id`.
2. Em todas as linhas de log da requisição (campo `requestId`).
3. Na transação do APM (atributo `requestId`), ao lado do `trace.id`.
4. No log da Lambda e do API Gateway, quando a requisição passou por ele: o Gateway
   envia o próprio `requestId` no cabeçalho, e a API o reaproveita.

Se o cabeçalho não vem (chamada direta no Load Balancer, ambiente local), a API gera um UUID.
Valores com caracteres fora de `[A-Za-z0-9_+/=-]` (o id do Gateway vem em base64, ex.:
`F0HpDiyQIAMEVmg=`) ou com mais de 64 caracteres são ignorados,
para ninguém injetar linhas falsas no log.

Para achar tudo de uma requisição: `SELECT * FROM Log WHERE requestId = '<id>'`, ou abra
a transação no APM → **Logs in context**.

## Eventos de negócio

**`OrdemServicoStatus`**: um por mudança de status (e um na abertura, com `para = 'RECEBIDA'`).

| Atributo | Exemplo |
|---|---|
| `ordemId` | `9b1c…` |
| `de` | `EM_DIAGNOSTICO` (vazio na abertura) |
| `para` | `AGUARDANDO_APROVACAO` |
| `minutosNoStatusAnterior` | `32.5` |
| `appName` (automático) | `oficina-api-prod` |

**`FalhaIntegracao`**: quando a chamada a um serviço externo falha (hoje, o de notificações).
Atributos: `integracao`, `tipo` (da notificação), `ordemId`, `mensagem`. O erro também vai para
o **Errors inbox** com a stack trace.

A falha não trava a OS: o event bus isola cada assinante, então o orçamento é aprovado mesmo
que o aviso ao cliente se perca. Por isso ela precisa de um alerta próprio: não aparece como
erro 5xx.

## Dashboard

O arquivo [`observabilidade/dashboard.json`](../observabilidade/dashboard.json) tem duas páginas:

- **Negócio**: OS abertas hoje e por dia, tempo médio em cada status, mudanças por destino,
  erros de integração e as últimas falhas.
- **Plataforma**: requisições por minuto, latência p95, taxa de erro, CPU e memória dos pods,
  pods disponíveis (HPA) e logs de erro.

Para importar:

1. Copie o **Account ID** (menu do usuário → **Administration** → **Access management**, ou o
   número na URL do New Relic).
2. Troque o `0` dos `accountIds` pelo seu id:
   ```bash
   jq --argjson id <ACCOUNT_ID> '(.. | objects | select(has("accountIds")) | .accountIds) = [$id]' \
     observabilidade/dashboard.json > /tmp/dashboard.json
   ```
3. New Relic → **Dashboards** → **Import dashboard** → cole o conteúdo de `/tmp/dashboard.json`.

## Alertas

Em **Alerts** → **Alert Policies** → **New alert policy** (`Oficina`), crie as condições com
**NRQL**:

| Condição | NRQL | Limite |
|---|---|---|
| Falha no processamento de OS | `SELECT count(*) FROM FalhaIntegracao` | acima de 0 em 1 minuto → crítico |
| Erro 5xx na API | `SELECT count(*) FROM TransactionError WHERE appName LIKE 'oficina-api-%' AND numeric(http.statusCode) >= 500` | acima de 0 em 1 minuto → crítico |
| API lenta | `SELECT percentile(duration, 95) FROM Transaction WHERE appName LIKE 'oficina-api-%'` | acima de 1 s por 5 minutos → aviso; acima de 2 s → crítico |

O filtro de status no 5xx importa: a falha de notificação também fica registrada na transação
(com resposta 200), e sem ele as duas condições disparariam juntas.

Para receber o aviso, ligue a política a um destino em **Alerts** → **Destinations** (e-mail
basta).

## Monitor de disponibilidade

**Synthetic Monitoring** → **Create monitor** → **Ping**: URL
`https://<id>.execute-api.us-east-1.amazonaws.com/api/v1/health/ready` (a URL do Gateway de prod,
que aparece no Summary do pipeline do `oficina-lambda-auth`), a cada 5 minutos, de 1 ou 2
locais.

> No Learner Lab o ambiente é destruído ao fim de cada sessão e a URL do Gateway muda. Atualize o
> monitor (ou pause-o) a cada sessão, senão ele fica acusando falha.

## Provocar uma falha (para ver o alerta)

```bash
# O serviço de notificações "cai": cada aviso ao cliente vira FalhaIntegracao (a OS segue)
kubectl set env deployment/oficina-api -n homolog SIMULAR_FALHA_NOTIFICACAO=true

# ...concluir um diagnóstico ou aprovar um orçamento pela API...

# Volta ao normal
kubectl set env deployment/oficina-api -n homolog SIMULAR_FALHA_NOTIFICACAO-
```

## Gerar movimento nos gráficos

```bash
make carga NAMESPACE=homolog       # gerador de carga no cluster (HPA, CPU, latência)
make sem-carga NAMESPACE=homolog
```

## Configuração

| Onde | O quê |
|---|---|
| `Dockerfile` | `node -r newrelic` e o agente **desligado** por padrão (`NEW_RELIC_ENABLED=false`) |
| `k8s/base/configmap.yaml` | Liga o agente; ignora 4xx como erro (são regras de negócio) |
| Overlays | `NEW_RELIC_APP_NAME` = `oficina-api-homolog` / `oficina-api-prod` |
| Secret `oficina-secrets` | `NEW_RELIC_LICENSE_KEY`, vindo do secret do GitHub |
| Pipeline | Instala o `nri-bundle` (versão fixa) no namespace `newrelic` |

Localmente, para mandar dados para a sua conta, crie um `.env` (ignorado pelo git) e suba o
Compose:

```bash
NEW_RELIC_ENABLED=true
NEW_RELIC_LICENSE_KEY=<sua license key>
```
