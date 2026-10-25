import { Global, Module } from '@nestjs/common';
import { PrismaService } from './infraestrutura/prisma/prisma.service';
import { PUBLICADOR_DE_EVENTOS } from './dominio/publicador-de-eventos';
import { EventEmitterPublicador } from './infraestrutura/eventos/event-emitter-publicador';
import { GERADOR_DE_ID } from './dominio/gerador-de-id';
import { UuidGeradorDeId } from './infraestrutura/id/uuid-gerador-de-id';
import {
  AGENTE_APM,
  carregarAgenteApm,
} from './infraestrutura/observabilidade/agente-apm';

/**
 * Shared kernel: conexão única do banco, event bus, gerador de id e o agente
 * de APM. É @Global para que os módulos não precisem reimportá-lo.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: PUBLICADOR_DE_EVENTOS, useClass: EventEmitterPublicador },
    { provide: GERADOR_DE_ID, useClass: UuidGeradorDeId },
    { provide: AGENTE_APM, useFactory: () => carregarAgenteApm() },
  ],
  exports: [PrismaService, PUBLICADOR_DE_EVENTOS, GERADOR_DE_ID, AGENTE_APM],
})
export class CompartilhadoModule {}
