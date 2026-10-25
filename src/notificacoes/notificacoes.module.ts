import { Module } from '@nestjs/common';
import { OrdemServicoModule } from '../ordem-servico/ordem-servico.module';
import { NotificarCliente } from './use-cases/notificar-cliente.handler';
import { ReenviarPendentes } from './use-cases/reenviar-pendentes.policy';
import { NOTIFICADOR } from './use-cases/notificador';
import { NotificadorSimulado } from './adapters/gateways/notificador-simulado';

/**
 * Contexto Notificações. Adapta o Serviço de Notificações externo: escuta
 * eventos do Ordem de Serviço (orçamento enviado/aprovado/recusado) e reenvia
 * lembretes às OS sem resposta. Importa OrdemServicoModule só pela porta pública
 * de consulta — não conhece suas entidades. É um contexto reativo, sem agregado
 * próprio: por isso não tem camada `entities`.
 */
@Module({
  imports: [OrdemServicoModule],
  providers: [
    { provide: NOTIFICADOR, useClass: NotificadorSimulado },
    NotificarCliente,
    ReenviarPendentes,
  ],
})
export class NotificacoesModule {}
