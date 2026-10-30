# ADR 0002 — Padrão de comunicação: HTTP síncrono pelo API Gateway

- **Status:** Aceita
- **Data:** 2026-10-29 (registro de decisão tomada no planejamento da Fase 3)
- **Contexto da decisão:** Fase 3 — o enunciado pede um API Gateway como porta de entrada, uma
  função serverless para autenticar o cliente por CPF e rotas protegidas por JWT.

## Contexto

Na Fase 3 o sistema passa a ter três peças que conversam entre si:

- o **API Gateway**, porta de entrada única;
- as **Lambdas** `auth-cpf` (login do cliente) e `Authorizer` (confere o JWT);
- o **app NestJS** no EKS, que continua sendo um monolito modular (ver
  [`arquitetura.md`](../arquitetura.md)).

Era preciso decidir como o Gateway fala com o app, como a `auth-cpf` descobre se o CPF é de um
cliente ativo e se valia introduzir mensageria entre as peças.

## Decisão

1. **Gateway → app: HTTP síncrono, integração `HTTP_PROXY`.** O Gateway repassa a requisição
   inteira ao Load Balancer do ambiente, sem transformar o corpo. Só sobrescreve o caminho
   (`overwrite:path`) e o cabeçalho `x-request-id`, que leva o id da requisição no Gateway até os
   logs do app.
2. **Gateway → Lambdas: invocação direta.** `POST /auth/cpf` invoca a `auth-cpf`; toda rota
   protegida passa antes pelo `Authorizer` (resposta simples, `isAuthorized`).
3. **`auth-cpf` → banco: leitura direta no RDS**, com o usuário `oficina_auth`, que só tem `SELECT`
   na tabela `cliente`. A Lambda não chama o app.
4. **Sem mensageria entre as peças.** Dentro do app continua valendo o event bus in-process da
   Fase 2 (portas públicas para resposta síncrona, eventos para efeito posterior).
5. **HTTP API**, não REST API, no Gateway.

## Alternativas consideradas

- **`auth-cpf` chamando o app por HTTP** (ex.: uma rota interna "existe cliente com este CPF?").
  Manteria o banco só com o app, mas o login do cliente passaria a depender do app no ar e
  exigiria uma rota interna protegida de outro jeito. A leitura direta, com um usuário que só lê
  uma tabela, é mais simples e tem o menor privilégio possível.
- **Mensageria (SQS/SNS) entre Gateway, Lambdas e app.** Não há nenhuma conversa assíncrona entre
  serviços: o login precisa da resposta na hora, e o app é um serviço só. Uma fila acrescentaria
  custo e pontos de falha sem resolver problema nenhum.
- **REST API no Gateway.** Tem mais recursos (validação de corpo, planos de uso, cache), nenhum
  necessário aqui. A HTTP API é mais barata, mais simples de configurar e tem o Lambda Authorizer
  com resposta simples.
- **Integração Lambda proxy para o app** (uma Lambda no meio repassando para o EKS). Uma camada a
  mais, com latência e custo, para fazer o que o `HTTP_PROXY` já faz.

## Consequências

**Positivas**
- Um caminho só para todas as rotas do app, fácil de seguir: Gateway → Load Balancer → pod.
- O `x-request-id` liga a requisição do Gateway aos logs e à transação no New Relic.
- O login por CPF não depende do app: funciona mesmo durante um deploy do EKS.

**Negativas / trade-offs**
- A `auth-cpf` conhece a tabela `cliente` (colunas `id`, `documento`, `tipoDocumento`, `ativo`).
  Mudar essas colunas no `prisma/schema.prisma` exige ajustar o repositório
  [`oficina-lambda-auth`](https://github.com/madurubini/oficina-lambda-auth) junto.
- O tráfego entre o Gateway e o Load Balancer é HTTP, não HTTPS. Aceitável no laboratório; em
  produção real, o Load Balancer teria certificado (ou o Gateway usaria um VPC Link).
- O token é conferido duas vezes (Authorizer e app). É de propósito: o Gateway barra quem não tem
  token válido, e o app decide o que cada papel pode fazer.
