import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AGENTE_APM,
  AgenteApm,
} from '../../../compartilhado/infraestrutura/observabilidade/agente-apm';
import { Notificador, TipoNotificacao } from '../../use-cases/notificador';

/**
 * Adaptador simulado do Serviço de Notificações (MVP): registra no log o aviso
 * que seria enviado ao cliente. Em produção, integraria com app/e-mail/SMS.
 *
 * `SIMULAR_FALHA_NOTIFICACAO=true` faz o serviço "cair". A falha vira o evento
 * `FalhaIntegracao` no New Relic (painel e alerta) e o erro segue para o event
 * bus, que isola o assinante: a OS continua, só o aviso ao cliente se perde.
 */
@Injectable()
export class NotificadorSimulado implements Notificador {
  private readonly logger = new Logger('Notificacoes');

  constructor(@Inject(AGENTE_APM) private readonly agente: AgenteApm) {}

  async notificar(entrada: {
    ordemId: string;
    tipo: TipoNotificacao;
    mensagem: string;
  }): Promise<void> {
    if (process.env.SIMULAR_FALHA_NOTIFICACAO === 'true') {
      const erro = new Error(
        'Serviço de notificações indisponível (simulado).',
      );
      this.agente.recordCustomEvent('FalhaIntegracao', {
        integracao: 'notificacoes',
        tipo: entrada.tipo,
        ordemId: entrada.ordemId,
        mensagem: erro.message,
      });
      this.agente.noticeError(erro, { integracao: 'notificacoes' });
      throw erro;
    }
    this.logger.log(
      `[${entrada.tipo}] OS ${entrada.ordemId}: ${entrada.mensagem}`,
    );
  }
}
