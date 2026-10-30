# Arquitetura — visão desenhada

Os diagramas abaixo são a mesma coisa que o código: cada seta existe em algum lugar de `src/`.
Estão em [Mermaid](https://mermaid.js.org) para renderizarem direto no GitHub e para que uma
mudança de arquitetura apareça no diff, como qualquer outro arquivo versionado.

Sumário:

1. [Contexto](#1-contexto-quem-usa-e-com-o-que-conversa)
2. [Módulos e comunicação](#2-módulos-e-comunicação)
3. [Camadas da Clean Architecture](#3-camadas-da-clean-architecture)
4. [Ciclo de vida da OS](#4-ciclo-de-vida-da-os-máquina-de-estados)
5. [Fluxo principal ponta a ponta](#5-fluxo-principal-ponta-a-ponta)
6. [O desvio "peça em falta"](#6-o-desvio-peça-em-falta)
7. [Componentes na nuvem (Fase 3)](#7-componentes-na-nuvem-fase-3)

---

## 1. Contexto: quem usa e com o que conversa

```mermaid
flowchart TB
    recepcionista["Recepcionista<br/><i>abre a OS, entrega o veículo</i>"]
    mecanico["Mecânico<br/><i>diagnostica e executa</i>"]
    gestor["Gestor<br/><i>cadastros e relatórios</i>"]
    cliente["Cliente<br/><i>acompanha e aprova orçamento</i>"]

    sistema["<b>Sistema de Oficina</b><br/>API REST — NestJS<br/><i>atendimento, OS, estoque</i>"]

    banco[("PostgreSQL<br/><i>um banco, um deploy</i>")]
    notificacoes["Serviço de Notificações<br/><i>avisa o cliente</i>"]
    fornecedor["Fornecedor<br/><i>cotação e encomenda de peças</i>"]

    recepcionista -->|"JWT"| sistema
    mecanico -->|"JWT"| sistema
    gestor -->|"JWT"| sistema
    cliente -->|"JWT do cliente (login por CPF)"| sistema

    sistema --> banco
    sistema -->|"orçamento, status, retirada"| notificacoes
    sistema -->|"peça em falta"| fornecedor

    classDef ator fill:#e8f0fe,stroke:#4a6fa5,color:#1a2b47
    classDef externo fill:#f4f1e8,stroke:#9a8c68,color:#3d3520
    classDef nucleo fill:#e3f2e8,stroke:#4a8a5f,color:#12301d
    class recepcionista,mecanico,gestor,cliente ator
    class notificacoes,fornecedor externo
    class sistema nucleo
```

Os três papéis administrativos entram pelo mesmo JWT; o que os separa é o papel (`@Papeis('GESTOR')`).
O cliente não tem senha: entra com o **CPF** e recebe um JWT próprio (`papel: 'CLIENTE'`), que só abre
as rotas de `/acompanhamento` das OSs dele. Na nuvem quem emite esse token é a Lambda `auth-cpf`
(ver a [seção 7](#7-componentes-na-nuvem-fase-3)).

---

## 2. Módulos e comunicação

Monolito modular: um deploy e um banco, organizados por **contexto delimitado**. Nenhum módulo
importa entidade ou repositório de outro — só as duas formas de conversa abaixo.

```mermaid
flowchart LR
    subgraph nucleo["Núcleo"]
        os["<b>ordem-servico</b><br/><i>agregado OrdemServico</i>"]
    end

    subgraph suporte["Contextos de suporte"]
        cv["clientes-veiculos"]
        cat["catalogo-servicos"]
        est["estoque"]
    end

    subgraph apoio["Apoio"]
        idt["identidade<br/><i>JWT, papéis, token da OS</i>"]
        notif["notificacoes<br/><i>reativo, sem agregado</i>"]
    end

    comp["<b>compartilhado</b> — Prisma · event bus · GeradorDeId · VOs · erros"]

    os -->|"CLIENTES_VEICULOS_API"| cv
    os -->|"CATALOGO_SERVICOS_API"| cat
    os -->|"ESTOQUE_API"| est
    notif -->|"ORDEM_SERVICO_CONSULTA"| os

    os -.->|"orcamento-aprovado<br/>execucao-concluida<br/>os-cancelada"| est
    os -.->|"orcamento-enviado / aprovado / recusado<br/>execucao-concluida · veiculo-entregue"| notif
    est -.->|"peca-recebida"| os

    nucleo --- comp
    suporte --- comp
    apoio --- comp

    classDef nucleoC fill:#e3f2e8,stroke:#4a8a5f,color:#12301d
    classDef suporteC fill:#e8f0fe,stroke:#4a6fa5,color:#1a2b47
    classDef apoioC fill:#f4f1e8,stroke:#9a8c68,color:#3d3520
    classDef compC fill:#f0eef6,stroke:#7a6f9b,color:#2b2440
    class os nucleoC
    class cv,cat,est suporteC
    class idt,notif apoioC
    class comp compC
```

**Linha cheia = porta pública** (interface + token `Symbol`), quando é preciso resposta síncrona:
abrir a OS confere o cliente, e o orçamento busca preço no catálogo e disponibilidade no estoque.

**Linha tracejada = evento** (event bus in-process), quando é efeito posterior. O assinante importa
o contrato do evento com `import type`, sem acoplar em runtime. É o que permite o fan-out: ao
aprovar um orçamento, o núcleo publica **um** evento e o estoque reserva enquanto as notificações
avisam — um sem saber que o outro existe.

| Evento | Publica | Reagem |
|---|---|---|
| `ordem-servico.orcamento-enviado` | ordem-servico | notificacoes |
| `ordem-servico.orcamento-aprovado` | ordem-servico | estoque (reserva/encomenda) · notificacoes |
| `ordem-servico.orcamento-recusado` | ordem-servico | notificacoes |
| `ordem-servico.execucao-concluida` | ordem-servico | estoque (baixa) · notificacoes |
| `ordem-servico.veiculo-entregue` | ordem-servico | notificacoes |
| `ordem-servico.os-cancelada` | ordem-servico | estoque (cancela encomendas) |
| `estoque.peca-recebida` | estoque | ordem-servico (retoma a execução) |

---

## 3. Camadas da Clean Architecture

Cada módulo de domínio abre nas mesmas três pastas. A quarta camada (Frameworks & Drivers) é
global — `main.ts` e `compartilhado/infraestrutura` — e não vira pasta por módulo.

```mermaid
flowchart RL
    subgraph fd["Frameworks & Drivers — global"]
        direction TB
        fd1["main.ts · NestJS · Prisma Client · Postgres · JWT"]
    end

    subgraph ad["adapters/"]
        direction TB
        ad1["controllers/ — REST + Swagger"]
        ad2["presenters/ — entidade → DTO"]
        ad3["gateways/ — implementação Prisma"]
        ad4["dtos.ts — class-validator"]
    end

    subgraph uc["use-cases/"]
        direction TB
        uc1["casos de uso"]
        uc2["interfaces que eles exigem:<br/>repositório · porta pública · gateway"]
    end

    subgraph en["entities/"]
        direction TB
        en1["entidades · value objects · eventos<br/><i>sem Nest, sem Prisma, sem HTTP</i>"]
    end

    fd --> ad --> uc --> en

    classDef c1 fill:#e3f2e8,stroke:#4a8a5f,color:#12301d
    classDef c2 fill:#e8f0fe,stroke:#4a6fa5,color:#1a2b47
    classDef c3 fill:#f4f1e8,stroke:#9a8c68,color:#3d3520
    classDef c4 fill:#f0eef6,stroke:#7a6f9b,color:#2b2440
    class en,en1 c1
    class uc,uc1,uc2 c2
    class ad,ad1,ad2,ad3,ad4 c3
    class fd,fd1 c4
```

As setas são a **regra de dependência**: só apontam para dentro. O gateway Prisma depende da
interface do repositório, que vive junto de quem a exige (o caso de uso) — por isso não existe
pasta `ports/`, que seria vocabulário hexagonal. O porquê de cada decisão está em
[`fase2/decisoes-arquiteturais.md`](fase2/decisoes-arquiteturais.md).

Uma requisição atravessa as camadas assim:

```mermaid
flowchart LR
    req["POST /ordens-servico"] --> ctrl["OrdensServicoController"]
    ctrl -->|"DTO validado"| caso["AbrirOrdemServico"]
    caso -->|"porta"| cvapi["CLIENTES_VEICULOS_API"]
    caso -->|"regras + invariantes"| ent["OrdemServico<br/><i>entidade</i>"]
    caso -->|"interface"| repo["OrdemServicoRepository"]
    repo -.->|"implementa"| gw["PrismaOrdemServicoRepositorio"]
    gw --> db[("Postgres")]
    caso -->|"eventos do agregado"| bus(["PublicadorDeEventos"])
    ent --> pres["apresentarOrdemServico"] --> resp["201 + DTO"]

    classDef borda fill:#f4f1e8,stroke:#9a8c68,color:#3d3520
    classDef aplic fill:#e8f0fe,stroke:#4a6fa5,color:#1a2b47
    classDef dominio fill:#e3f2e8,stroke:#4a8a5f,color:#12301d
    class ctrl,pres,gw borda
    class caso,repo,cvapi,bus aplic
    class ent dominio
```

---

## 4. Ciclo de vida da OS (máquina de estados)

Toda mudança passa por `transicionarPara`; o que não está no mapa é rejeitado com
`ErroTransicaoInvalida` → **HTTP 422**.

```mermaid
stateDiagram-v2
    [*] --> Recebida: abrir OS
    Recebida --> EmDiagnostico: iniciar diagnóstico
    EmDiagnostico --> AguardandoAprovacao: concluir diagnóstico<br/>(gera e envia o orçamento)
    AguardandoAprovacao --> EmExecucao: cliente aprova<br/>(peças disponíveis)
    AguardandoAprovacao --> AguardandoPeca: cliente aprova<br/>(alguma peça encomendada)
    AguardandoPeca --> EmExecucao: peça chega ao estoque<br/><i>automático</i>
    EmExecucao --> Finalizada: concluir execução<br/>(sem orçamento pendente)
    Finalizada --> Entregue: pagamento + entrega
    Entregue --> [*]

    Recebida --> Cancelada
    EmDiagnostico --> Cancelada
    AguardandoAprovacao --> Cancelada: cliente recusa o inicial
    AguardandoPeca --> Cancelada
    EmExecucao --> Cancelada
    Cancelada --> [*]

    note right of AguardandoPeca
        Espera passiva pelo fornecedor:
        fica no fim da fila de trabalho.
    end note
```

A **fila de trabalho** (`GET /ordens-servico/fila`) mostra só os estados vivos, nesta prioridade:
Em execução › Aguardando aprovação › Em diagnóstico › Recebida › Aguardando peça — e, dentro de
cada um, as mais antigas primeiro. Finalizada, Entregue e Cancelada saem da fila (exclusão lógica:
continuam no banco).

---

## 5. Fluxo principal ponta a ponta

Do diagnóstico à execução, com o fan-out de eventos na aprovação.

```mermaid
sequenceDiagram
    autonumber
    actor Mecanico as Mecânico
    participant API as Controllers
    participant OS as ordem-servico
    participant Cat as catalogo-servicos
    participant Est as estoque
    actor Cliente
    participant Notif as notificacoes

    Mecanico->>API: POST /{id}/diagnostico/iniciar
    API->>OS: IniciarDiagnostico
    OS-->>API: Em diagnóstico

    Mecanico->>API: POST /{id}/diagnostico (serviços, peças)
    API->>OS: RegistrarDiagnostico
    OS->>Cat: preço do serviço (porta)
    OS->>Est: disponibilidade da peça (porta)
    Note over OS: preço congelado no orçamento<br/>peça sem saldo → EM_COTACAO
    OS-->>API: Aguardando aprovação + orçamento
    OS--)Notif: orcamento-enviado
    Notif--)Cliente: link de acompanhamento (token da OS)

    Cliente->>API: POST /acompanhamento/{os}/orcamentos/{orc}/resposta
    API->>OS: AprovarOrcamento
    OS--)Est: orcamento-aprovado
    OS--)Notif: orcamento-aprovado
    Est->>Est: reserva o disponível,<br/>encomenda o que falta
    OS-->>API: Em execução (ou Aguardando peça)

    Mecanico->>API: POST /{id}/execucao/concluir
    API->>OS: ConcluirExecucao
    OS--)Est: execucao-concluida
    Est->>Est: baixa as peças reservadas
    OS-->>API: Finalizada
```

Repare que nenhuma dessas consequências é rota: reservar, encomendar, baixar, gerar orçamento e
notificar acontecem **dentro** da ação que o ator pediu. É o princípio "comando automático não é
rota", do [contrato](contrato-api.md).

---

## 6. O desvio "peça em falta"

Quando o orçamento aprovado tem peça sem saldo, a OS não entra em execução: ela espera. A volta é
automática e nasce de uma entrada de estoque — não de alguém mudando o status na mão.

```mermaid
sequenceDiagram
    autonumber
    actor Cliente
    participant OS as ordem-servico
    participant Est as estoque
    actor Recepcao as Recepcionista

    Cliente->>OS: aprova o orçamento
    OS--)Est: orcamento-aprovado
    Est->>Est: encomenda a peça em falta (PENDENTE)
    OS-->>Cliente: Aguardando peça

    Recepcao->>Est: PATCH /pecas/{id}/estoque<br/>{ tipo: ENTRADA }
    Est->>Est: atende as encomendas da peça (FIFO)<br/>e reserva para a OS
    Est--)OS: peca-recebida
    OS->>OS: retoma — histórico registra "sistema"
    OS-->>Recepcao: Em execução
```

Se a entrada não cobre a fila inteira, o atendimento para na primeira encomenda que não couber: as
demais seguem PENDENTE até chegar mais peça. E se a OS for cancelada antes disso, o evento
`os-cancelada` cancela as encomendas pendentes dela.

---

## 7. Componentes na nuvem (Fase 3)

Na Fase 3 o mesmo app roda na AWS, atrás de um API Gateway, com o banco gerenciado e o
monitoramento no New Relic. A infraestrutura está dividida em 4 repositórios, indicados entre
parênteses: ① `oficina-infra-k8s`, ② `oficina-infra-db`, ③ `oficina-app` (este) e
④ `oficina-lambda-auth`.

```mermaid
flowchart TB
    cliente["Cliente<br/><i>entra com o CPF</i>"]
    operador["Gestor · Mecânico · Recepcionista<br/><i>usuário e senha</i>"]

    subgraph aws["AWS · us-east-1"]
        subgraph gw["API Gateway HTTP API · uma stack por ambiente (④)"]
            rotaCpf["POST /auth/cpf"]
            rotaLivre["/api/v1/auth/login · /api/v1/health · /api/docs<br/><i>livres</i>"]
            rotaProt["ANY /api/v1/{proxy+}<br/><i>protegida</i>"]
        end

        authz["λ Authorizer<br/><i>confere o JWT</i>"]
        cw[("CloudWatch Logs<br/><i>logs das Lambdas, 7 dias</i>")]

        subgraph vpc["VPC 10.0.0.0/16 · 2 subnets públicas em 2 zonas · sem NAT (①)"]
            authCpf["λ auth-cpf<br/><i>valida o CPF e emite o JWT</i>"]
            lbH["Load Balancer<br/>homolog"]
            lbP["Load Balancer<br/>prod"]

            subgraph eks["EKS oficina-eks · 2 nós t3.medium (①)"]
                subgraph nsH["namespace homolog"]
                    appH["oficina-api<br/><i>HPA 1–3 pods</i>"]
                end
                subgraph nsP["namespace prod"]
                    appP["oficina-api<br/><i>HPA 2–10 pods</i>"]
                end
                nri["nri-bundle<br/><i>namespace newrelic</i>"]
                ms["metrics-server<br/><i>add-on do EKS</i>"]
            end

            rds[("RDS PostgreSQL 16 · db.t3.micro (②)<br/><i>schemas homolog e prod</i>")]
        end

        ecr[("ECR<br/><i>imagem do app, tag = SHA</i>")]
        s3[("S3<br/><i>state do Terraform<br/>e pacotes do SAM</i>")]
    end

    gha["GitHub Actions<br/><i>um pipeline por repositório</i>"]
    nr["New Relic<br/><i>APM · logs · eventos de negócio<br/>Kubernetes · alertas · uptime</i>"]

    cliente -->|"CPF"| rotaCpf
    cliente -->|"Bearer JWT do cliente"| rotaProt
    operador -->|"usuário e senha"| rotaLivre
    operador -->|"Bearer JWT do operador"| rotaProt

    rotaCpf --> authCpf
    authCpf -->|"SELECT cliente<br/>usuário oficina_auth"| rds
    rotaProt -.->|"pode passar?"| authz
    rotaLivre & rotaProt -->|"HTTP_PROXY<br/>stack homolog"| lbH
    rotaLivre & rotaProt -->|"HTTP_PROXY<br/>stack prod"| lbP
    lbH --> appH
    lbP --> appP
    appH -->|"schema homolog"| rds
    appP -->|"schema prod"| rds
    ms -.->|"CPU dos pods"| appH & appP

    authz & authCpf -.-> cw
    appH & appP -->|"APM, logs JSON, eventos"| nr
    nri -->|"CPU, memória, pods"| nr
    nr -.->|"ping no /health"| rotaLivre

    gha -->|"terraform apply (① ②)"| vpc
    gha -->|"docker push (③)"| ecr
    gha -->|"kubectl apply -k (③)"| eks
    gha -->|"sam deploy (④)"| gw
    gha -.->|"state e pacotes"| s3
    ecr -.->|"pull da imagem"| appH & appP

    classDef ator fill:#e8f0fe,stroke:#4a6fa5,color:#1a2b47
    classDef externo fill:#f4f1e8,stroke:#9a8c68,color:#3d3520
    classDef nucleo fill:#e3f2e8,stroke:#4a8a5f,color:#12301d
    class cliente,operador ator
    class gha,nr externo
    class appH,appP nucleo
```

| Componente | O que faz | Repositório |
|---|---|---|
| **API Gateway (HTTP API)** | Porta de entrada única. Uma stack por ambiente (`oficina-auth-homolog` e `oficina-auth-prod`), cada uma apontando para o Load Balancer do seu namespace | ④ |
| **λ Authorizer** | Confere assinatura e validade do JWT (HS256) em toda rota protegida. Aceita o token do operador e o do cliente; quem decide o que cada um pode fazer é o app | ④ |
| **λ auth-cpf** | Valida o CPF, busca o cliente ativo no RDS e devolve o JWT do cliente | ④ |
| **VPC** | Rede própria com 2 subnets públicas em 2 zonas, sem NAT Gateway | ① |
| **EKS + node group** | Kubernetes gerenciado, 2 nós `t3.medium` (até 3). Os dois ambientes ficam no mesmo cluster, separados por namespace | ① |
| **metrics-server** | Add-on do EKS que mede a CPU dos pods. Sem ele o HPA não escala | ① |
| **ECR** | Registro das imagens do app, com tag = SHA do commit | ① |
| **RDS PostgreSQL** | Banco gerenciado, sem acesso público. Um schema por ambiente | ② |
| **oficina-api (Deployment + HPA)** | A API NestJS. Homolog com 1–3 pods, prod com 2–10 | ③ |
| **Load Balancer** | Um por namespace, criado pelo Service `LoadBalancer` do Kubernetes (fora do Terraform) | ③ |
| **nri-bundle** | Integração Kubernetes do New Relic: CPU, memória e estado dos pods | ③ |
| **New Relic** | APM e logs do app, eventos de negócio (`OrdemServicoStatus`, `FalhaIntegracao`), dashboard, alertas e monitor de uptime | ③ |
| **S3** | State do Terraform (① e ②) e pacotes do SAM (④) | criado à mão, uma vez |

**Três escolhas que o diagrama mostra:**

- **Só a `auth-cpf` entra na VPC.** Ela precisa ler o RDS, que não tem acesso público. O
  Authorizer só confere a assinatura do token, sem banco, por isso fica fora da VPC e não paga a
  criação das interfaces de rede.
- **Sem NAT Gateway.** O NAT cobra por hora e consumiria o saldo do Learner Lab. Os nós ficam nas
  subnets públicas para baixar imagens do ECR, e o RDS continua fechado pelo security group, que
  só aceita o cluster e as Lambdas.
- **Um cluster e um banco para os dois ambientes.** Homolog e prod ficam separados por namespace
  no EKS e por schema no RDS, sem dobrar o custo. Cada ambiente tem sua stack do Gateway, seu Load
  Balancer e seus dados.

---

## Onde isso vive no código

| Diagrama | Código |
|---|---|
| Portas públicas | `src/*/use-cases/*.api.ts` + `*-api.service.ts` |
| Eventos e assinantes | `src/*/entities/eventos.ts` · `@OnEvent(...)` nas policies/handlers |
| Máquina de estados | `src/ordem-servico/entities/status-os.ts` |
| Agregado e invariantes | `src/ordem-servico/entities/ordem-servico.ts` |
| Persistência do agregado | `src/ordem-servico/adapters/gateways/prisma-ordem-servico.repositorio.ts` |
| Envelope de erro | `src/compartilhado/erros/` |
