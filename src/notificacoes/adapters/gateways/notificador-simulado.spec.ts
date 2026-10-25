import { agenteInerte } from '../../../compartilhado/infraestrutura/observabilidade/agente-apm';
import { NotificadorSimulado } from './notificador-simulado';

describe('NotificadorSimulado', () => {
  const entrada = {
    ordemId: 'os-1',
    tipo: 'ORCAMENTO_ENVIADO' as const,
    mensagem: 'Seu orçamento está pronto.',
  };

  function montar() {
    const agente = {
      ...agenteInerte,
      recordCustomEvent: jest.fn(),
      noticeError: jest.fn(),
    };
    return { agente, notificador: new NotificadorSimulado(agente) };
  }

  afterEach(() => {
    delete process.env.SIMULAR_FALHA_NOTIFICACAO;
  });

  it('registra o aviso no log, sem falha no APM', async () => {
    const { agente, notificador } = montar();

    await expect(notificador.notificar(entrada)).resolves.toBeUndefined();
    expect(agente.recordCustomEvent).not.toHaveBeenCalled();
  });

  it('com SIMULAR_FALHA_NOTIFICACAO=true, "cai" e registra FalhaIntegracao', async () => {
    process.env.SIMULAR_FALHA_NOTIFICACAO = 'true';
    const { agente, notificador } = montar();

    await expect(notificador.notificar(entrada)).rejects.toThrow(
      'indisponível',
    );
    expect(agente.recordCustomEvent).toHaveBeenCalledWith('FalhaIntegracao', {
      integracao: 'notificacoes',
      tipo: 'ORCAMENTO_ENVIADO',
      ordemId: 'os-1',
      mensagem: 'Serviço de notificações indisponível (simulado).',
    });
    expect(agente.noticeError).toHaveBeenCalled();
  });
});
