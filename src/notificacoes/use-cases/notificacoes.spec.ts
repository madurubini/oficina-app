import type { OrdemServicoConsultaApi } from '../../ordem-servico/use-cases/ordem-servico-consulta.api';
import type {
  ExecucaoConcluida,
  OrcamentoAprovado,
  OrcamentoEnviado,
  OrcamentoRecusado,
  VeiculoEntregue,
} from '../../ordem-servico/entities/eventos';
import { Notificador } from './notificador';
import { NotificarCliente } from './notificar-cliente.handler';
import { ReenviarPendentes } from './reenviar-pendentes.policy';

describe('NotificarCliente (assinante de eventos)', () => {
  let notificador: jest.Mocked<Notificador>;
  let handler: NotificarCliente;

  beforeEach(() => {
    notificador = { notificar: jest.fn() };
    handler = new NotificarCliente(notificador);
  });

  it('notifica ao enviar o orçamento', async () => {
    await handler.aoEnviar({
      ordemId: 'os-1',
      numero: 'OS-1',
    } as OrcamentoEnviado);
    expect(notificador.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ ordemId: 'os-1', tipo: 'ORCAMENTO_ENVIADO' }),
    );
  });

  it('o link do orçamento leva à OS sem credencial: o cliente entra com o CPF', async () => {
    await handler.aoEnviar({
      ordemId: 'os-1',
      numero: 'OS-1',
    } as OrcamentoEnviado);
    const { mensagem } = notificador.notificar.mock.calls[0][0];
    expect(mensagem).toContain('/acompanhamento/os-1');
    expect(mensagem).toContain('CPF');
    expect(mensagem).not.toContain('token');
  });

  it('notifica ao aprovar (fan-out: estoque reserva, notificacoes avisa)', async () => {
    await handler.aoAprovar({
      ordemId: 'os-1',
      itensPeca: [],
    } as unknown as OrcamentoAprovado);
    expect(notificador.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'ORCAMENTO_APROVADO' }),
    );
  });

  it('notifica ao recusar', async () => {
    await handler.aoRecusar({
      ordemId: 'os-1',
      justificativa: null,
    } as OrcamentoRecusado);
    expect(notificador.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'ORCAMENTO_RECUSADO' }),
    );
  });

  it('notifica que o veículo está pronto ao concluir a execução', async () => {
    await handler.aoConcluirExecucao({
      ordemId: 'os-1',
      tempoExecucaoMin: 30,
    } as ExecucaoConcluida);
    expect(notificador.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'VEICULO_PRONTO' }),
    );
  });

  it('notifica a entrega do veículo', async () => {
    await handler.aoEntregar({
      ordemId: 'os-1',
      numero: 'OS-1',
    } as VeiculoEntregue);
    expect(notificador.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'VEICULO_ENTREGUE' }),
    );
  });
});

describe('ReenviarPendentes (cliente sem resposta)', () => {
  let consulta: jest.Mocked<OrdemServicoConsultaApi>;
  let notificador: jest.Mocked<Notificador>;
  let policy: ReenviarPendentes;

  beforeEach(() => {
    consulta = {
      listarAguardandoResposta: jest.fn().mockResolvedValue([]),
      listarOrcamentosAdicionaisAguardando: jest.fn().mockResolvedValue([]),
    };
    notificador = { notificar: jest.fn() };
    policy = new ReenviarPendentes(consulta, notificador);
  });

  it('reenvia lembrete para orçamentos inicial e adicional aguardando', async () => {
    consulta.listarAguardandoResposta.mockResolvedValue([
      { ordemId: 'os-1', numero: 'OS-1' },
    ]);
    consulta.listarOrcamentosAdicionaisAguardando.mockResolvedValue([
      { ordemId: 'os-2', numero: 'OS-2', orcamentoId: 'orc-2' },
    ]);

    await policy.reenviar();

    expect(notificador.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'LEMBRETE_APROVACAO' }),
    );
    expect(notificador.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'LEMBRETE_ORCAMENTO_ADICIONAL' }),
    );
  });

  it('não faz nada quando não há pendências', async () => {
    await policy.reenviar();
    expect(notificador.notificar).not.toHaveBeenCalled();
  });
});
