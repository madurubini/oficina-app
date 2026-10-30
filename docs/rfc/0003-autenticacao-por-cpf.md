# RFC 0003 — Estratégia de autenticação

| | |
|---|---|
| **Status** | Aceita e implementada |
| **Data** | Proposta no planejamento da Fase 3 (outubro de 2026); registrada em 2026-10-30 |
| **Decisões que nasceram daqui** | [ADR 0002](../adr/0002-padrao-de-comunicacao.md), [ADR 0006](../adr/0006-aws-sam-para-as-lambdas.md) |
| **Fluxo desenhado** | [`arquitetura.md`, seção 8](../arquitetura.md#8-sequência-autenticação-por-cpf) |

## Resumo

O cliente da oficina passa a entrar **só com o CPF**, por uma função serverless que devolve um
JWT. O API Gateway confere esse token antes de deixar a requisição chegar ao app. Os operadores
(gestor, mecânico, recepcionista) continuam com usuário e senha.

## Problema

O enunciado da Fase 3 pede:

- autenticação do cliente **pelo CPF**, numa **função serverless** que consulta o cadastro;
- rotas protegidas por **JWT** no API Gateway.

Até a Fase 2, o cliente acompanhava a OS por um link com um token próprio daquela OS, sem login.
Os operadores já usavam JWT emitido pelo app.

## Critérios

1. **Atender o enunciado:** login por CPF numa função serverless e JWT verificado no Gateway.
2. **Um modelo só de acesso no app:** o app já confere JWT dos operadores.
3. **Segurança proporcional:** o CPF não é segredo; a solução precisa limitar o estrago disso.
4. **Viável no Learner Lab:** sem criar roles do IAM e com custo baixo.
5. **Simplicidade** de implementar e de explicar.

## Opções

### A. Lambda `auth-cpf` + Lambda Authorizer (proposta)

A Lambda valida o CPF, consulta o cliente no RDS e assina um JWT HS256
`{ sub: clienteId, papel: 'CLIENTE' }` com o mesmo segredo do app. O Authorizer do Gateway confere
assinatura e validade de qualquer token (operador ou cliente). O app confere de novo e decide o
que cada papel pode fazer.

### B. Amazon Cognito

O Cognito gerencia usuários e emite tokens, e o HTTP API tem um autorizador JWT nativo para ele.
Mas o Cognito é feito para usuário e senha (ou login social). Entrar só com o CPF exigiria o
*custom authentication flow*, com três Lambdas de gatilho, e manter os clientes duplicados no
Cognito e no banco da oficina. Os operadores, que já têm login no app, teriam de migrar também.

### C. Login por CPF dentro do próprio app

Uma rota `POST /auth/cpf` no NestJS resolveria com menos peças, mas não atende o pedido de uma
**função serverless** para a autenticação.

### D. Autorizador JWT nativo do HTTP API, em vez da Lambda Authorizer

O autorizador nativo é mais barato (não invoca Lambda), mas só aceita tokens de um emissor OIDC,
com chaves públicas publicadas (JWKS). Não funciona com HS256 e segredo compartilhado, que é como
o app e a Lambda assinam.

| Critério | **A. Lambda + Authorizer** | B. Cognito | C. No app | D. JWT nativo |
|---|---|---|---|---|
| Atende o enunciado | Sim | Sim | Não (sem função serverless) | Só com emissor OIDC |
| Mudança no app | Pequena (guard do cliente) | Grande (trocar o login dos operadores) | Média | Grande (assinatura assimétrica) |
| Peças novas | 2 Lambdas | User pool + 3 Lambdas de gatilho | Nenhuma | Emissor OIDC + JWKS |
| Dados duplicados | Não (lê o RDS) | Sim (clientes no Cognito) | Não | Não |

## Proposta

Adotar a **opção A**:

1. **`POST /auth/cpf`** no Gateway invoca a Lambda `auth-cpf`:
   - CPF com formato ou dígitos inválidos → **400**;
   - CPF sem cliente ativo → **401**, a mesma resposta para "não cadastrado" e "inativo", para a
     rota não revelar quem é cliente;
   - cliente ativo → **200** com `{ accessToken, expiresIn }`, token válido por 1 hora.
2. A Lambda lê o banco com o usuário **`oficina_auth`**, que só tem `SELECT` na tabela `cliente`.
3. **Toda rota protegida passa pelo Authorizer**, que confere assinatura (HS256 fixo) e validade.
   Sem token o Gateway responde 401; token inválido, 403.
4. **O app confere o token de novo:** o `ClienteGuard` só aceita `papel: 'CLIENTE'` nas rotas de
   `/acompanhamento`; o `JwtStrategy` recusa token de cliente nas rotas administrativas (403); e a
   OS precisa ser do cliente (403 para a OS de outro).
5. Os **operadores** continuam com `POST /api/v1/auth/login` (usuário e senha), rota livre no
   Gateway que vai direto ao app.
6. O link com token por OS da Fase 2 é **removido**: a notificação passa a pedir que o cliente
   entre com o CPF.

## Segurança

O CPF não é segredo: quem souber o CPF de um cliente consegue o token dele. A proposta reduz o
risco assim:

| Medida | Efeito |
|---|---|
| Mesma resposta para CPF inexistente e inativo | A rota não serve para descobrir quem é cliente |
| Limite de requisições no `POST /auth/cpf` (5/s, pico 10) | Dificulta testar CPFs em massa |
| Token de cliente só abre `/acompanhamento`, e só as OSs dele | Um token obtido indevidamente não lê outros clientes nem rotas administrativas |
| Validade de 1 hora | Limita o tempo de uso de um token vazado |
| Usuário de banco só de leitura | Um problema na Lambda não altera nem apaga dados |

**Evolução recomendada** para produção real: um segundo fator na entrada do cliente, como um
código de uso único enviado por SMS ou e-mail ao contato cadastrado. O formato do token e o
Authorizer não mudam; só a `auth-cpf` passa a exigir o código antes de assinar.

## Riscos

- **Segredo compartilhado:** app e Lambda assinam com o mesmo `JWT_SECRET`. Quem tiver o segredo
  emite tokens de qualquer papel. Mitigação: o segredo só existe nos Secrets do GitHub e nas
  variáveis das Lambdas e do pod. Evolução possível: assinatura assimétrica (RS256), em que a
  Lambda assina e o app só verifica.
- **O token não é revogado antes de expirar:** um cliente desativado segue com acesso até o fim
  da hora. Aceitável para o escopo do projeto.

## Decisão

Aceita. Implementada no repositório `oficina-lambda-auth` (Lambdas e Gateway em SAM, ADR 0006) e
no app (`ClienteGuard` e `JwtStrategy`), com o fluxo descrito no ADR 0002.
