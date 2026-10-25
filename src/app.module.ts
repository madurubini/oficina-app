import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { CompartilhadoModule } from './compartilhado/compartilhado.module';
import { HealthModule } from './health/health.module';
import { IdentidadeModule } from './identidade/identidade.module';
import { ClientesVeiculosModule } from './clientes-veiculos/clientes-veiculos.module';
import { OrdemServicoModule } from './ordem-servico/ordem-servico.module';
import { CatalogoServicosModule } from './catalogo-servicos/catalogo-servicos.module';
import { EstoqueModule } from './estoque/estoque.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { ObservabilidadeModule } from './observabilidade/observabilidade.module';
import { AGENTE_APM } from './compartilhado/infraestrutura/observabilidade/agente-apm';
import { opcoesDeLog } from './compartilhado/infraestrutura/observabilidade/logs';

/**
 * Composição raiz: um módulo por contexto delimitado. O ScheduleModule
 * habilita o reenvio periódico de notificações; o LoggerModule troca o logger
 * do Nest por logs em JSON com o requestId de cada requisição.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    CompartilhadoModule,
    LoggerModule.forRootAsync({
      inject: [AGENTE_APM],
      useFactory: opcoesDeLog,
    }),
    HealthModule,
    IdentidadeModule,
    ClientesVeiculosModule,
    CatalogoServicosModule,
    EstoqueModule,
    OrdemServicoModule,
    NotificacoesModule,
    ObservabilidadeModule,
  ],
})
export class AppModule {}
