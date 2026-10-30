# ADR 0003 — Escalabilidade horizontal com HPA

- **Status:** Aceita
- **Data:** 2026-10-29 (registro de decisão tomada na Fase 2 e ajustada na Fase 3)
- **Contexto da decisão:** a API precisa aguentar picos de uso sem ficar com réplicas sobrando
  o tempo todo, dentro do orçamento do Learner Lab.

## Contexto

A API roda no EKS como um `Deployment` (`oficina-api`). A carga varia ao longo do dia, e na
gravação da demonstração é preciso mostrar a aplicação escalando sob o gerador de carga
(`k8s/gerador-carga.yaml`). O cluster tem 2 nós `t3.medium` (máximo 3 no node group).

## Decisão

Usar o **HorizontalPodAutoscaler** (`autoscaling/v2`), definido em `k8s/base/hpa.yaml`:

| | Homolog | Prod |
|---|---|---|
| Réplicas | 1 a 3 | 2 a 10 |
| Alvo de CPU | 60% do `requests` (100m) | igual |
| Alvo de memória | 75% do `requests` (192Mi) | igual |

- **Sobe rápido:** pode dobrar o número de pods a cada 15 s, sem janela de estabilização.
- **Desce devagar:** no máximo metade dos pods por minuto, depois de 120 s estável. Evita oscilar
  a cada pico curto.
- **Métricas:** vêm do **metrics-server**, instalado como add-on do EKS no repositório
  [`oficina-infra-k8s`](https://github.com/madurubini/oficina-infra-k8s) (o EKS não traz um por
  padrão).
- Os limites por ambiente ficam nos overlays do Kustomize (`k8s/overlays/homolog` e `prod`).

## Alternativas consideradas

- **Réplicas fixas.** Simples, mas ou sobra capacidade (custo) ou falta no pico.
- **Escalar por requisições ou latência** (KEDA, ou métricas customizadas do New Relic). Mede a
  carga de forma mais direta, mas exige instalar e manter mais um componente. CPU e memória
  resolvem para uma API como esta, em que o trabalho por requisição é parecido.
- **Cluster Autoscaler / Karpenter** para criar nós sob demanda. Ficou de fora: exigiria permissões
  de IAM que o Learner Lab não dá, e 2 nós comportam os 10 pods de prod (10 × 100m de CPU
  reservada).

## Consequências

**Positivas**
- Prod começa com 2 pods (sem ponto único de falha) e chega a 10 no pico.
- Homolog gasta o mínimo: 1 pod no dia a dia.
- O comportamento é visível na demonstração (`kubectl get hpa -w` e o gráfico de pods no
  dashboard do New Relic).

**Negativas / trade-offs**
- O número de **nós** não escala sozinho. Se homolog e prod chegarem ao máximo juntos, os pods
  disputam os mesmos 2 nós; o node group só vai a 3 se o tamanho for mudado no Terraform.
- O HPA depende dos `requests` declarados no `Deployment`. Mudar `requests` muda quando ele escala.
- Sem o metrics-server o HPA fica sem dado e não escala (aparece `<unknown>` no `kubectl get hpa`).

## Evolução registrada — paginação nas listagens

*Registrada em 2026-10-30, na revisão de código. Ainda não implementada.*

**Problema.** As listagens (`GET /ordens-servico`, `/ordens-servico/fila`, `/clientes`, `/pecas`,
`/servicos` e os veículos de um cliente) devolvem todos os registros. A de ordens de serviço ainda
traz cada OS completa, com histórico, orçamentos e linhas. O tempo de resposta e a memória do pod
crescem sem limite junto com os dados, e o HPA, que também escala por memória, pode criar pods
por causa de uma consulta grande e não por carga de verdade.

**Evolução proposta.**
- Parâmetros `limite` (padrão 20, máximo 100) e `deslocamento` nas listagens, validados no DTO, e
  `take`/`skip` no `findMany` do Prisma.
- Na lista de OSs, um `include` enxuto (sem as linhas do orçamento). O detalhe completo continua
  em `GET /ordens-servico/{id}`.
- A resposta passa a trazer o total (`{ itens, total }`), o que muda o contrato da API: atualizar
  `docs/contrato-api.md` e avisar quem consome.

**Por que ainda não.** Muda o formato das respostas de várias rotas. Com o volume de dados do
projeto, as listagens ainda respondem rápido.
