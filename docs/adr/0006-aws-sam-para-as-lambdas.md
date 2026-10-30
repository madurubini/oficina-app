# ADR 0006 — AWS SAM para o Gateway e as Lambdas

- **Status:** Aceita
- **Data:** 2026-10-29 (registro de decisão tomada no planejamento da Fase 3)
- **Contexto da decisão:** o repositório
  [`oficina-lambda-auth`](https://github.com/madurubini/oficina-lambda-auth) precisa descrever o
  API Gateway, as duas Lambdas e o deploy delas em homologação e produção.

## Contexto

As Lambdas são escritas em TypeScript, precisam ser compiladas e empacotadas, e o Gateway tem
rotas, integração com o app e um Lambda Authorizer. A rede e o banco já são descritos em
Terraform (repositórios ① e ②). O material de Serverless do curso usa o AWS SAM.

## Decisão

Usar o **AWS SAM** (`template.yaml`):

- `AWS::Serverless::HttpApi` para o Gateway e `AWS::Serverless::Function` para as Lambdas, com
  build pelo **esbuild** e runtime **Node.js 22**;
- **uma stack por ambiente** (`oficina-auth-homolog` e `oficina-auth-prod`), com o ambiente como
  parâmetro;
- os pacotes ficam no mesmo bucket S3 do state do Terraform, em `sam/<ambiente>/`;
- senha do banco e segredo do JWT entram como parâmetros `NoEcho`, vindos dos Secrets do GitHub;
- o pipeline roda `sam validate --lint` e `sam build` no PR, `sam deploy` em `homolog` e `main`,
  e `sam delete` no destroy manual.

## Alternativas consideradas

- **Terraform**, igual aos repositórios ① e ②. Uma ferramenta só no projeto, mas empacotar a
  Lambda, gerar o zip e ligar Gateway, rotas e permissões fica bem mais verboso que no SAM.
- **Serverless Framework.** Popular e enxuto, mas a partir da v4 exige conta na plataforma deles,
  e não é o que o curso usa.
- **AWS CDK.** Infraestrutura em TypeScript, mesma linguagem das Lambdas, mas acrescenta uma camada
  de código para gerar o CloudFormation que o SAM já escreve de forma declarativa.

## Consequências

**Positivas**
- O `template.yaml` é curto e legível: rotas, integração e Authorizer num arquivo só.
- `sam build` resolve compilação e empacotamento; o mesmo template serve aos dois ambientes.
- Segue o material das aulas de Serverless.

**Negativas / trade-offs**
- **Duas ferramentas de infraestrutura** no projeto (Terraform e SAM/CloudFormation). Os valores
  que cruzam as duas (VPC, subnets, security group, endereço do banco) são lidos pelo pipeline do
  ④ no state do Terraform e passados como parâmetros.
- **Apagar a stack é lento.** O CloudFormation espera a AWS liberar as interfaces de rede da
  `auth-cpf` (que está na VPC): 20 a 40 minutos por stack. Por isso a derrubada começa pelo ④.
