import { agenteInerte } from '../compartilhado/infraestrutura/observabilidade/agente-apm';
import { OSAberta, StatusOSAlterado } from '../ordem-servico/entities/eventos';
import { StatusOS } from '../ordem-servico/entities/status-os';
import { EVENTO_STATUS_OS, EventosDeNegocio } from './eventos-de-negocio';

describe('EventosDeNegocio', () => {
  function montar() {
    const agente = { ...agenteInerte, recordCustomEvent: jest.fn() };
    return { agente, eventos: new EventosDeNegocio(agente) };
  }

  it('registra a abertura da OS como entrada em RECEBIDA', () => {
    const { agente, eventos } = montar();

    eventos.aoAbrir(new OSAberta('os-1', 'OS-0001'));

    expect(agente.recordCustomEvent).toHaveBeenCalledWith(EVENTO_STATUS_OS, {
      ordemId: 'os-1',
      numero: 'OS-0001',
      de: '',
      para: 'RECEBIDA',
      minutosNoStatusAnterior: 0,
    });
  });

  it('registra cada mudança de status com o tempo no status anterior', () => {
    const { agente, eventos } = montar();

    eventos.aoMudarStatus(
      new StatusOSAlterado(
        'os-1',
        StatusOS.EM_DIAGNOSTICO,
        StatusOS.AGUARDANDO_APROVACAO,
        32.5,
      ),
    );

    expect(agente.recordCustomEvent).toHaveBeenCalledWith(EVENTO_STATUS_OS, {
      ordemId: 'os-1',
      de: 'EM_DIAGNOSTICO',
      para: 'AGUARDANDO_APROVACAO',
      minutosNoStatusAnterior: 32.5,
    });
  });
});
