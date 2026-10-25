import { Module } from '@nestjs/common';
import { EventosDeNegocio } from './eventos-de-negocio';

/**
 * Observabilidade de negócio: escuta eventos de domínio e os registra no New
 * Relic. Não é um contexto do domínio (como o health); o agente vem do
 * CompartilhadoModule.
 */
@Module({
  providers: [EventosDeNegocio],
})
export class ObservabilidadeModule {}
