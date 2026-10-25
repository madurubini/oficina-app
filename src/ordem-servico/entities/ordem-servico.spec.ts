import {
  ErroNaoEncontrado,
  ErroTransicaoInvalida,
  ErroValidacao,
} from '../../compartilhado/erros/erros-dominio';
import {
  PecaOrcada,
  ServicoOrcado,
  SituacaoPecaOrcada,
  StatusOrcamento,
  TipoOrcamento,
} from './itens';
import { OrdemServico } from './ordem-servico';
import { StatusOS, transicaoPermitida } from './status-os';

function abrirOS(): OrdemServico {
  return OrdemServico.abrir({
    id: 'os-1',
    numero: 'OS-000001',
    clienteId: 'c1',
    veiculoId: 'v1',
    problemaRelatado: 'Barulho na suspensão',
    por: 'recepcionista',
  });
}

describe('OrdemServico.abrir', () => {
  it('abre no status Recebida com histórico e evento', () => {
    const os = abrirOS();
    expect(os.status).toBe(StatusOS.RECEBIDA);
    expect(os.versao).toBe(0);
    expect(os.pago).toBe(false);
    expect(os.historico).toHaveLength(1);
    expect(os.historico[0].status).toBe(StatusOS.RECEBIDA);
    expect(os.historico[0].por).toBe('recepcionista');
    const eventos = os.puxarEventos();
    expect(eventos).toHaveLength(1);
    expect(eventos[0].nomeEvento).toBe('ordem-servico.os-aberta');
  });

  it('exige problema relatado', () => {
    expect(() =>
      OrdemServico.abrir({
        id: 'os-1',
        numero: 'OS-1',
        clienteId: 'c1',
        veiculoId: 'v1',
        problemaRelatado: '   ',
      }),
    ).toThrow('Problema relatado é obrigatório.');
  });
});

describe('Máquina de estados da OS', () => {
  it('permite o caminho feliz completo', () => {
    const os = abrirOS();
    os.transicionarPara(StatusOS.EM_DIAGNOSTICO);
    os.transicionarPara(StatusOS.AGUARDANDO_APROVACAO);
    os.transicionarPara(StatusOS.EM_EXECUCAO);
    os.transicionarPara(StatusOS.FINALIZADA);
    os.transicionarPara(StatusOS.ENTREGUE);
    expect(os.status).toBe(StatusOS.ENTREGUE);
    expect(os.historico).toHaveLength(6);
  });

  it('grava histórico e evento a cada transição', () => {
    const os = abrirOS();
    os.puxarEventos();
    os.transicionarPara(StatusOS.EM_DIAGNOSTICO, 'mecanico');
    expect(os.historico[1]).toMatchObject({
      status: StatusOS.EM_DIAGNOSTICO,
      por: 'mecanico',
    });
    const eventos = os.puxarEventos();
    expect(eventos[0].nomeEvento).toBe('ordem-servico.status-alterado');
  });

  it('o evento de status leva os minutos que a OS passou no status anterior', () => {
    jest.useFakeTimers({ now: new Date('2026-10-25T10:00:00Z') });
    try {
      const os = abrirOS();
      os.puxarEventos();
      jest.setSystemTime(new Date('2026-10-25T10:45:30Z'));
      os.transicionarPara(StatusOS.EM_DIAGNOSTICO);
      expect(os.puxarEventos()[0]).toMatchObject({
        de: StatusOS.RECEBIDA,
        para: StatusOS.EM_DIAGNOSTICO,
        minutosNoStatusAnterior: 45.5,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejeita transição fora da ordem (ex.: Recebida → Em execução)', () => {
    const os = abrirOS();
    expect(() => os.transicionarPara(StatusOS.EM_EXECUCAO)).toThrow(
      ErroTransicaoInvalida,
    );
    expect(os.status).toBe(StatusOS.RECEBIDA);
  });

  it('permite cancelar a partir de estados vivos, mas não de estados finais', () => {
    expect(transicaoPermitida(StatusOS.RECEBIDA, StatusOS.CANCELADA)).toBe(
      true,
    );
    expect(transicaoPermitida(StatusOS.EM_EXECUCAO, StatusOS.CANCELADA)).toBe(
      true,
    );
    expect(transicaoPermitida(StatusOS.ENTREGUE, StatusOS.CANCELADA)).toBe(
      false,
    );
    expect(
      transicaoPermitida(StatusOS.CANCELADA, StatusOS.EM_DIAGNOSTICO),
    ).toBe(false);
  });

  it('não permite transicionar a partir de um estado final', () => {
    const os = abrirOS();
    os.transicionarPara(StatusOS.CANCELADA);
    expect(() => os.transicionarPara(StatusOS.EM_DIAGNOSTICO)).toThrow(
      ErroTransicaoInvalida,
    );
  });
});

const servico = (over: Partial<ServicoOrcado> = {}): ServicoOrcado => ({
  id: 'is1',
  servicoId: 's1',
  descricao: 'Serviço',
  quantidade: 1,
  precoAplicado: 100,
  ...over,
});

const peca = (over: Partial<PecaOrcada> = {}): PecaOrcada => ({
  id: 'ip1',
  pecaId: 'p1',
  descricao: 'Filtro',
  quantidade: 2,
  precoAplicado: 35,
  situacao: SituacaoPecaOrcada.DISPONIVEL,
  ...over,
});

describe('OrdemServico.iniciarDiagnostico e registrarDiagnostico', () => {
  it('iniciar leva de Recebida para Em diagnóstico', () => {
    const os = abrirOS();
    os.puxarEventos();
    os.iniciarDiagnostico('mecanico');

    expect(os.status).toBe(StatusOS.EM_DIAGNOSTICO);
    expect(os.puxarEventos().map((e) => e.nomeEvento)).toContain(
      'ordem-servico.status-alterado',
    );
  });

  it('registrar calcula os totais, gera o orçamento inicial ENVIADO e vai para Aguardando aprovação', () => {
    const os = abrirOS();
    os.iniciarDiagnostico();
    os.puxarEventos();
    os.registrarDiagnostico({
      servicos: [servico({ quantidade: 2, precoAplicado: 120 })],
      pecas: [peca({ quantidade: 4, precoAplicado: 35 })],
      orcamentoId: 'orc-1',
    });

    expect(os.status).toBe(StatusOS.AGUARDANDO_APROVACAO);
    expect(os.orcamento?.tipo).toBe(TipoOrcamento.INICIAL);
    expect(os.orcamento?.totalServicos).toBe(240); // 2 * 120
    expect(os.orcamento?.totalPecas).toBe(140); // 4 * 35
    expect(os.orcamento?.total).toBe(380);
    expect(os.orcamento?.status).toBe(StatusOrcamento.ENVIADO);
    expect(os.orcamento?.enviadoEm).toBeInstanceOf(Date);

    const nomes = os.puxarEventos().map((e) => e.nomeEvento);
    expect(nomes).toContain('ordem-servico.status-alterado');
    expect(nomes).toContain('ordem-servico.diagnostico-concluido');
    expect(nomes).toContain('ordem-servico.orcamento-gerado');
    expect(nomes).toContain('ordem-servico.orcamento-enviado');
  });

  it('exige ao menos um serviço ou peça', () => {
    const os = abrirOS();
    os.iniciarDiagnostico();
    expect(() =>
      os.registrarDiagnostico({
        servicos: [],
        pecas: [],
        orcamentoId: 'orc-1',
      }),
    ).toThrow(ErroValidacao);
    expect(os.status).toBe(StatusOS.EM_DIAGNOSTICO);
  });

  it('não registra diagnóstico se ele não foi iniciado (OS em Recebida)', () => {
    const os = abrirOS();
    expect(() =>
      os.registrarDiagnostico({
        servicos: [servico()],
        pecas: [],
        orcamentoId: 'orc-1',
      }),
    ).toThrow(ErroTransicaoInvalida);
    expect(os.status).toBe(StatusOS.RECEBIDA);
  });
});

describe('Ciclo de vida do orçamento inicial', () => {
  const pecaDisponivel = peca({ id: 'ip1', pecaId: 'p1', quantidade: 2 });
  const pecaCotada = peca({
    id: 'ip2',
    pecaId: 'p2',
    descricao: 'Pastilha',
    quantidade: 1,
    precoAplicado: 198,
    situacao: SituacaoPecaOrcada.EM_COTACAO,
  });

  // Registrar o diagnóstico já deixa o orçamento ENVIADO e a OS em Aguardando
  // aprovação (o envio passou a fazer parte da conclusão do diagnóstico).
  function osComOrcamento(): OrdemServico {
    const os = abrirOS();
    os.iniciarDiagnostico();
    os.registrarDiagnostico({
      servicos: [servico()],
      pecas: [pecaDisponivel, pecaCotada],
      orcamentoId: 'orc-1',
    });
    os.puxarEventos();
    return os;
  }

  it('o orçamento já nasce ENVIADO e a OS em Aguardando aprovação', () => {
    const os = osComOrcamento();
    expect(os.status).toBe(StatusOS.AGUARDANDO_APROVACAO);
    expect(os.orcamento?.status).toBe(StatusOrcamento.ENVIADO);
    expect(os.orcamento?.enviadoEm).toBeInstanceOf(Date);
  });

  it('aprovar com peça em cotação: APROVADO, OS → Aguardando peça, peças reservada/encomendada', () => {
    const os = osComOrcamento();

    os.aprovarOrcamento('orc-1', 'cliente');

    // Há peça encomendada (pecaCotada), então a execução não começa ainda.
    expect(os.status).toBe(StatusOS.AGUARDANDO_PECA);
    expect(os.iniciadoExecucaoEm).toBeNull();
    expect(os.orcamento?.status).toBe(StatusOrcamento.APROVADO);
    expect(os.orcamento?.pecas[0].situacao).toBe(SituacaoPecaOrcada.RESERVADA);
    expect(os.orcamento?.pecas[1].situacao).toBe(
      SituacaoPecaOrcada.ENCOMENDADA,
    );

    const aprovado = os
      .puxarEventos()
      .find((e) => e.nomeEvento === 'ordem-servico.orcamento-aprovado');
    expect(aprovado).toBeDefined();
    // o evento carrega a situação ORIGINAL (para o estoque decidir)
    const payload = aprovado as unknown as {
      itensPeca: { situacao: string }[];
    };
    expect(payload.itensPeca).toEqual([
      expect.objectContaining({ situacao: 'DISPONIVEL' }),
      expect.objectContaining({ situacao: 'EM_COTACAO' }),
    ]);
  });

  it('recusar: ENVIADO → RECUSADO e OS → Cancelada', () => {
    const os = osComOrcamento();

    os.recusarOrcamento('orc-1', 'Muito caro', 'cliente');

    expect(os.status).toBe(StatusOS.CANCELADA);
    expect(os.orcamento?.status).toBe(StatusOrcamento.RECUSADO);
    const nomes = os.puxarEventos().map((e) => e.nomeEvento);
    expect(nomes).toContain('ordem-servico.orcamento-recusado');
    expect(nomes).toContain('ordem-servico.os-cancelada');
  });

  it('não aprova duas vezes o mesmo orçamento', () => {
    const os = osComOrcamento();
    os.aprovarOrcamento('orc-1', 'cliente');
    expect(() => os.aprovarOrcamento('orc-1')).toThrow(ErroTransicaoInvalida);
  });
});

describe('Aguardando peça e recebimento', () => {
  function osComPecas(pecas: PecaOrcada[]): OrdemServico {
    const os = abrirOS();
    os.iniciarDiagnostico();
    os.registrarDiagnostico({
      servicos: [servico()],
      pecas,
      orcamentoId: 'orc-1',
    });
    os.puxarEventos();
    return os;
  }

  it('aprovar com tudo disponível: OS → Em execução e marca o início', () => {
    const os = osComPecas([peca({ situacao: SituacaoPecaOrcada.DISPONIVEL })]);
    os.aprovarOrcamento('orc-1', 'cliente');
    expect(os.status).toBe(StatusOS.EM_EXECUCAO);
    expect(os.iniciadoExecucaoEm).toBeInstanceOf(Date);
  });

  it('recebimento parcial mantém Aguardando peça; a última peça retoma a execução', () => {
    const os = osComPecas([
      peca({
        id: 'ip1',
        pecaId: 'p1',
        situacao: SituacaoPecaOrcada.EM_COTACAO,
      }),
      peca({
        id: 'ip2',
        pecaId: 'p2',
        situacao: SituacaoPecaOrcada.EM_COTACAO,
      }),
    ]);
    os.aprovarOrcamento('orc-1', 'cliente');
    expect(os.status).toBe(StatusOS.AGUARDANDO_PECA);
    os.puxarEventos();

    os.registrarRecebimentoDePeca('p1');
    expect(os.status).toBe(StatusOS.AGUARDANDO_PECA);
    expect(os.orcamento?.pecas[0].situacao).toBe(SituacaoPecaOrcada.RESERVADA);
    expect(os.orcamento?.pecas[1].situacao).toBe(
      SituacaoPecaOrcada.ENCOMENDADA,
    );
    expect(os.puxarEventos()).toHaveLength(0); // nada de transição ainda

    os.registrarRecebimentoDePeca('p2');
    expect(os.status).toBe(StatusOS.EM_EXECUCAO);
    expect(os.iniciadoExecucaoEm).toBeInstanceOf(Date);
    // Retomada automática: o ator do histórico é "sistema", não null.
    const ultimo = os.historico[os.historico.length - 1];
    expect(ultimo.status).toBe(StatusOS.EM_EXECUCAO);
    expect(ultimo.por).toBe('sistema');
    expect(os.puxarEventos().map((e) => e.nomeEvento)).toContain(
      'ordem-servico.status-alterado',
    );
  });

  it('recebimento é idempotente e ignora peça que não está na OS', () => {
    const os = osComPecas([
      peca({
        id: 'ip1',
        pecaId: 'p1',
        situacao: SituacaoPecaOrcada.EM_COTACAO,
      }),
    ]);
    os.aprovarOrcamento('orc-1', 'cliente');
    os.registrarRecebimentoDePeca('p1');
    expect(os.status).toBe(StatusOS.EM_EXECUCAO);
    os.puxarEventos();

    // de novo a mesma peça (já reservada) e uma peça inexistente: sem efeito
    os.registrarRecebimentoDePeca('p1');
    os.registrarRecebimentoDePeca('p9');
    expect(os.status).toBe(StatusOS.EM_EXECUCAO);
    expect(os.puxarEventos()).toHaveLength(0);
  });
});

describe('Execução e orçamento adicional', () => {
  function osEmExecucao(): OrdemServico {
    const os = abrirOS();
    os.iniciarDiagnostico();
    os.registrarDiagnostico({
      servicos: [servico()],
      pecas: [peca()],
      orcamentoId: 'orc-1',
    });
    os.aprovarOrcamento('orc-1', 'cliente');
    os.puxarEventos();
    return os;
  }

  function adicional(os: OrdemServico): void {
    os.adicionarOrcamentoAdicional({
      id: 'orc-2',
      descricao: 'Correia',
      servicos: [servico({ id: 'is2', servicoId: 's2', precoAplicado: 80 })],
      pecas: [],
    });
  }

  it('marca o início da execução ao aprovar', () => {
    const os = osEmExecucao();
    expect(os.status).toBe(StatusOS.EM_EXECUCAO);
    expect(os.iniciadoExecucaoEm).toBeInstanceOf(Date);
  });

  it('concluir: registra fim, vai para Finalizada e emite execucao-concluida', () => {
    const os = osEmExecucao();
    os.concluirExecucao('mecanico');
    expect(os.status).toBe(StatusOS.FINALIZADA);
    expect(os.finalizadoEm).toBeInstanceOf(Date);
    expect(os.puxarEventos().map((e) => e.nomeEvento)).toContain(
      'ordem-servico.execucao-concluida',
    );
  });

  it('lançar adicional: cria orçamento ADICIONAL ENVIADO, OS segue em execução', () => {
    const os = osEmExecucao();
    adicional(os);
    expect(os.orcamentos).toHaveLength(2);
    const orc2 = os.orcamentos.find((o) => o.id === 'orc-2')!;
    expect(orc2.tipo).toBe(TipoOrcamento.ADICIONAL);
    expect(orc2.status).toBe(StatusOrcamento.ENVIADO);
    expect(orc2.total).toBe(80);
    expect(os.status).toBe(StatusOS.EM_EXECUCAO);
    const nomes = os.puxarEventos().map((e) => e.nomeEvento);
    expect(nomes).toContain('ordem-servico.orcamento-gerado');
    expect(nomes).toContain('ordem-servico.orcamento-enviado');
  });

  it('não conclui execução com orçamento adicional aguardando', () => {
    const os = osEmExecucao();
    adicional(os);
    expect(() => os.concluirExecucao()).toThrow(ErroValidacao);
    expect(os.status).toBe(StatusOS.EM_EXECUCAO);
  });

  it('recusar adicional: marca RECUSADO e depois conclui (inicial intacto)', () => {
    const os = osEmExecucao();
    const totalInicial = os.orcamento!.total;
    adicional(os);
    os.recusarOrcamento('orc-2');
    const orc2 = os.orcamentos.find((o) => o.id === 'orc-2')!;
    expect(orc2.status).toBe(StatusOrcamento.RECUSADO);
    expect(os.orcamento!.total).toBe(totalInicial);
    os.concluirExecucao();
    expect(os.status).toBe(StatusOS.FINALIZADA);
  });

  it('adicional com peça encomendada bloqueia a conclusão até a peça chegar', () => {
    const os = osEmExecucao();
    os.adicionarOrcamentoAdicional({
      id: 'orc-2',
      descricao: 'Bomba',
      servicos: [],
      pecas: [
        peca({
          id: 'ip2',
          pecaId: 'p2',
          descricao: 'Bomba',
          quantidade: 1,
          situacao: SituacaoPecaOrcada.EM_COTACAO,
        }),
      ],
    });
    os.aprovarOrcamento('orc-2');
    // ADICIONAL não muda o status: segue em execução, mas com peça encomendada.
    expect(os.status).toBe(StatusOS.EM_EXECUCAO);
    expect(() => os.concluirExecucao()).toThrow(ErroValidacao);

    os.registrarRecebimentoDePeca('p2');
    os.concluirExecucao('mecanico');
    expect(os.status).toBe(StatusOS.FINALIZADA);
  });

  it('aprovar adicional: peças viram RESERVADA, emite orcamento-aprovado, OS segue', () => {
    const os = osEmExecucao();
    os.adicionarOrcamentoAdicional({
      id: 'orc-2',
      descricao: 'Correia',
      servicos: [],
      pecas: [
        peca({
          id: 'ip2',
          pecaId: 'p2',
          descricao: 'Correia',
          quantidade: 1,
          precoAplicado: 50,
          situacao: SituacaoPecaOrcada.DISPONIVEL,
        }),
      ],
    });
    os.puxarEventos();
    os.aprovarOrcamento('orc-2');
    const orc2 = os.orcamentos.find((o) => o.id === 'orc-2')!;
    expect(orc2.pecas[0].situacao).toBe(SituacaoPecaOrcada.RESERVADA);
    expect(orc2.status).toBe(StatusOrcamento.APROVADO);
    expect(os.status).toBe(StatusOS.EM_EXECUCAO);
    expect(os.puxarEventos().map((e) => e.nomeEvento)).toContain(
      'ordem-servico.orcamento-aprovado',
    );
  });
});

describe('Pagamento e entrega', () => {
  function osFinalizada(): OrdemServico {
    const os = abrirOS();
    os.iniciarDiagnostico();
    os.registrarDiagnostico({
      servicos: [servico()],
      pecas: [],
      orcamentoId: 'orc-1',
    });
    os.aprovarOrcamento('orc-1', 'cliente');
    os.concluirExecucao('mecanico');
    os.puxarEventos();
    return os;
  }

  it('marca pago e emite pagamento-confirmado', () => {
    const os = osFinalizada();
    os.marcarPago();
    expect(os.pago).toBe(true);
    expect(os.pagoEm).toBeInstanceOf(Date);
    expect(os.puxarEventos().map((e) => e.nomeEvento)).toContain(
      'ordem-servico.pagamento-confirmado',
    );
  });

  it('não marca pago se a OS não está finalizada', () => {
    const os = abrirOS();
    expect(() => os.marcarPago()).toThrow(ErroTransicaoInvalida);
  });

  it('não marca pago duas vezes', () => {
    const os = osFinalizada();
    os.marcarPago();
    expect(() => os.marcarPago()).toThrow(ErroValidacao);
  });

  it('entrega exige pagamento confirmado', () => {
    const os = osFinalizada();
    expect(() => os.entregar('recepcionista')).toThrow(ErroValidacao);
    expect(os.status).toBe(StatusOS.FINALIZADA);
  });

  it('entrega de OS cancelada falha por transição inválida (não por pagamento)', () => {
    const os = abrirOS();
    os.iniciarDiagnostico();
    os.registrarDiagnostico({
      servicos: [servico()],
      pecas: [],
      orcamentoId: 'orc-1',
    });
    os.recusarOrcamento('orc-1', 'caro', 'cliente');
    expect(os.status).toBe(StatusOS.CANCELADA);
    expect(() => os.entregar('recepcionista')).toThrow(ErroTransicaoInvalida);
  });

  it('entrega após pago: → Entregue e emite veiculo-entregue', () => {
    const os = osFinalizada();
    os.marcarPago();
    os.puxarEventos();
    os.entregar('recepcionista');
    expect(os.status).toBe(StatusOS.ENTREGUE);
    expect(os.puxarEventos().map((e) => e.nomeEvento)).toContain(
      'ordem-servico.veiculo-entregue',
    );
  });
});

describe('Guardas e getters do agregado', () => {
  function osEmExec(): OrdemServico {
    const os = abrirOS();
    os.iniciarDiagnostico();
    os.registrarDiagnostico({
      servicos: [servico()],
      pecas: [peca()],
      orcamentoId: 'orc-1',
    });
    os.aprovarOrcamento('orc-1', 'cliente'); // peça disponível → Em execução
    return os;
  }

  it('expõe os dados da OS pelos getters', () => {
    const os = abrirOS();
    expect(os.clienteId).toBe('c1');
    expect(os.veiculoId).toBe('v1');
    expect(os.problemaRelatado).toBe('Barulho na suspensão');
    expect(os.criadoEm).toBeInstanceOf(Date);
    expect(os.pagoEm).toBeNull();
    expect(os.iniciadoExecucaoEm).toBeNull();
    expect(os.finalizadoEm).toBeNull();
  });

  it('aprovar um orçamento inexistente lança ErroNaoEncontrado', () => {
    const os = osEmExec();
    expect(() => os.aprovarOrcamento('nao-existe')).toThrow(ErroNaoEncontrado);
  });

  it('recusar um orçamento inexistente lança ErroNaoEncontrado', () => {
    const os = osEmExec();
    expect(() => os.recusarOrcamento('nao-existe')).toThrow(ErroNaoEncontrado);
  });

  it('orçamento adicional fora da execução é rejeitado', () => {
    const os = abrirOS(); // ainda em Recebida
    expect(() =>
      os.adicionarOrcamentoAdicional({
        id: 'orc-2',
        descricao: 'Correia',
        servicos: [servico({ id: 'is2', servicoId: 's2' })],
        pecas: [],
      }),
    ).toThrow(ErroTransicaoInvalida);
  });

  it('orçamento adicional sem serviço nem peça é rejeitado', () => {
    const os = osEmExec();
    expect(() =>
      os.adicionarOrcamentoAdicional({
        id: 'orc-2',
        descricao: 'Vazio',
        servicos: [],
        pecas: [],
      }),
    ).toThrow(ErroValidacao);
  });
});

describe('Serviços e peças consolidados da OS', () => {
  it('a OS recém-aberta já tem os arrays, vazios', () => {
    const os = abrirOS();
    expect(os.servicos).toEqual([]);
    expect(os.pecas).toEqual([]);
  });

  it('o diagnóstico preenche os arrays com as linhas do orçamento inicial', () => {
    const os = abrirOS();
    os.iniciarDiagnostico();
    os.registrarDiagnostico({
      servicos: [servico({ descricao: 'Troca de óleo' })],
      pecas: [peca({ descricao: 'Filtro de óleo' })],
      orcamentoId: 'orc-1',
    });

    expect(os.servicos).toHaveLength(1);
    expect(os.servicos[0].descricao).toBe('Troca de óleo');
    expect(os.pecas).toHaveLength(1);
    expect(os.pecas[0].descricao).toBe('Filtro de óleo');
  });

  it('soma as linhas do adicional às do inicial, sem achatar o preço congelado', () => {
    const os = abrirOS();
    os.iniciarDiagnostico();
    os.registrarDiagnostico({
      servicos: [servico({ precoAplicado: 100 })],
      pecas: [],
      orcamentoId: 'orc-1',
    });
    os.aprovarOrcamento('orc-1');
    os.adicionarOrcamentoAdicional({
      id: 'orc-2',
      descricao: 'Reparo extra',
      // Mesmo serviço, preço acordado diferente: as duas linhas convivem.
      servicos: [servico({ id: 'is2', precoAplicado: 150 })],
      pecas: [peca({ id: 'ip2', pecaId: 'p2', descricao: 'Correia' })],
    });

    expect(os.servicos.map((s) => s.precoAplicado)).toEqual([100, 150]);
    expect(os.pecas.map((p) => p.descricao)).toEqual(['Correia']);
  });

  it('o orçamento recusado sai da consolidação', () => {
    const os = abrirOS();
    os.iniciarDiagnostico();
    os.registrarDiagnostico({
      servicos: [servico()],
      pecas: [],
      orcamentoId: 'orc-1',
    });
    os.aprovarOrcamento('orc-1');
    os.adicionarOrcamentoAdicional({
      id: 'orc-2',
      descricao: 'Reparo recusado',
      servicos: [servico({ id: 'is2', servicoId: 's2' })],
      pecas: [peca({ id: 'ip2', pecaId: 'p2' })],
    });
    expect(os.servicos).toHaveLength(2);

    os.recusarOrcamento('orc-2');
    expect(os.servicos.map((s) => s.servicoId)).toEqual(['s1']);
    expect(os.pecas).toEqual([]);
  });
});
