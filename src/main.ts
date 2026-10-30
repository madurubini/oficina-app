import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { FiltroExcecaoGlobal } from './compartilhado/erros/filtro-excecao-global';
import {
  AGENTE_APM,
  AgenteApm,
} from './compartilhado/infraestrutura/observabilidade/agente-apm';
import { traduzirErroPrisma } from './compartilhado/infraestrutura/prisma/erros-prisma';

async function bootstrap(): Promise<void> {
  // Os logs do boot esperam o logger JSON (pino) ficar pronto.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const agente = app.get<AgenteApm>(AGENTE_APM);

  // Prefixo global do contrato: /api/v1
  app.setGlobalPrefix('api/v1');

  // Validação automática dos DTOs (class-validator).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Envelope de erro padrão do contrato. O tradutor do Prisma converte violação
  // de constraint em erro de domínio (409/404/400) em vez de deixar virar 500.
  // O 500 que sobrar vai para o New Relic com a stack trace.
  app.useGlobalFilters(
    new FiltroExcecaoGlobal({
      tradutores: [traduzirErroPrisma],
      aoErroInesperado: (erro, idDaOcorrencia) =>
        agente.noticeError(
          erro instanceof Error ? erro : new Error(String(erro)),
          { idDaOcorrencia },
        ),
    }),
  );

  // Swagger em /api/docs.
  const config = new DocumentBuilder()
    .setTitle('Sistema de Oficina — API')
    .setDescription(
      'Atendimento e Execução de Serviços de oficina mecânica (DDD, monolito modular). ' +
        'Rotas administrativas exigem o JWT do operador (Bearer); as de /acompanhamento, o JWT do cliente (login por CPF). ' +
        'Erros seguem o envelope { erro: { codigo, mensagem, detalhes } }.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Autenticação', 'Login e emissão do JWT')
    .addTag('Clientes', 'CRUD de clientes (CPF/CNPJ único)')
    .addTag('Veículos', 'CRUD de veículos (placa única)')
    .addTag('Serviços (catálogo)', 'CRUD do catálogo de serviços')
    .addTag('Peças e estoque', 'CRUD de peças e ajuste de saldo')
    .addTag('Ordens de Serviço', 'Ciclo de vida da OS (admin)')
    .addTag(
      'Acompanhamento do cliente',
      'Consulta e decisões do cliente (token do login por CPF)',
    )
    .addTag('Relatórios', 'Indicadores gerenciais')
    .build();
  const documento = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documento);

  // No SIGTERM (rollout ou HPA descendo), o Nest para de aceitar conexões,
  // termina as requisições em andamento e roda os onModuleDestroy (o Prisma
  // fecha as conexões com o banco). Sem isso o processo morre na hora.
  app.enableShutdownHooks();

  const porta = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(porta);
  const logger = app.get(Logger);
  logger.log(`API ouvindo em http://localhost:${porta}/api/v1`);
  logger.log(`Swagger em http://localhost:${porta}/api/docs`);
}

void bootstrap();
