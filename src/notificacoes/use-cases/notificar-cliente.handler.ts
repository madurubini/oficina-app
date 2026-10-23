import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
// Só de tipo: os contratos dos eventos, sem acoplar ao módulo de OS.
import type {
  ExecucaoConcluida,
  OrcamentoAprovado,
  OrcamentoEnviado,
  OrcamentoRecusado,
  VeiculoEntregue,
} from '../../ordem-servico/entities/eventos';
import { NOTIFICADOR, Notificador } from './notificador';

/**
 * Fan-out do event bus: `orcamento-aprovado` é tratado pelo Estoque (reserva)
 * e aqui (aviso ao cliente), sem um conhecer o outro.
 *
 * O link leva à OS no aplicativo; para aprovar ou recusar, o cliente entra com
 * o CPF. O link não carrega credencial nenhuma, então pode ser repassado.
 */
@Injectable()
export class NotificarCliente {
  constructor(
    @Inject(NOTIFICADOR)
    private readonly notificador: Notificador,
  ) {}

  @OnEvent('ordem-servico.orcamento-enviado')
  async aoEnviar(evento: OrcamentoEnviado): Promise<void> {
    const adicional = (evento.tipo as string) === 'ADICIONAL';
    const link = `/acompanhamento/${evento.ordemId}`;
    await this.notificador.notificar({
      ordemId: evento.ordemId,
      tipo: adicional ? 'ORCAMENTO_ADICIONAL_ENVIADO' : 'ORCAMENTO_ENVIADO',
      mensagem: adicional
        ? `Identificamos um reparo adicional na OS ${evento.numero}. Entre no aplicativo com seu CPF para autorizar ou recusar: ${link}`
        : `Seu orçamento da OS ${evento.numero} está pronto. Entre no aplicativo com seu CPF para aprovar ou recusar: ${link}`,
    });
  }

  @OnEvent('ordem-servico.orcamento-aprovado')
  async aoAprovar(evento: OrcamentoAprovado): Promise<void> {
    const adicional = (evento.tipo as string) === 'ADICIONAL';
    await this.notificador.notificar({
      ordemId: evento.ordemId,
      tipo: 'ORCAMENTO_APROVADO',
      mensagem: adicional
        ? 'Reparo adicional aprovado. Vamos executá-lo também.'
        : 'Orçamento aprovado. Seu veículo entrou em execução.',
    });
  }

  @OnEvent('ordem-servico.orcamento-recusado')
  async aoRecusar(evento: OrcamentoRecusado): Promise<void> {
    const adicional = (evento.tipo as string) === 'ADICIONAL';
    await this.notificador.notificar({
      ordemId: evento.ordemId,
      tipo: 'ORCAMENTO_RECUSADO',
      mensagem: adicional
        ? 'Reparo adicional recusado. Seguiremos sem esse serviço.'
        : 'Orçamento recusado. A OS foi cancelada.',
    });
  }

  @OnEvent('ordem-servico.execucao-concluida')
  async aoConcluirExecucao(evento: ExecucaoConcluida): Promise<void> {
    await this.notificador.notificar({
      ordemId: evento.ordemId,
      tipo: 'VEICULO_PRONTO',
      mensagem: 'Seu veículo está pronto. Após o pagamento, pode ser retirado.',
    });
  }

  @OnEvent('ordem-servico.veiculo-entregue')
  async aoEntregar(evento: VeiculoEntregue): Promise<void> {
    await this.notificador.notificar({
      ordemId: evento.ordemId,
      tipo: 'VEICULO_ENTREGUE',
      mensagem: `Veículo entregue. OS ${evento.numero} encerrada. Obrigado!`,
    });
  }
}
