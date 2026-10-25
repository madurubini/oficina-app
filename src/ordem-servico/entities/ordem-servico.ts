import { AgregadoRaiz } from '../../compartilhado/dominio/agregado-raiz';
import {
  ErroNaoEncontrado,
  ErroTransicaoInvalida,
  ErroValidacao,
} from '../../compartilhado/erros/erros-dominio';
import {
  DiagnosticoConcluido,
  ExecucaoConcluida,
  ItemPecaAprovado,
  OrcamentoAprovado,
  OrcamentoEnviado,
  OrcamentoGerado,
  OrcamentoRecusado,
  OSAberta,
  OSCancelada,
  PagamentoConfirmado,
  StatusOSAlterado,
  VeiculoEntregue,
} from './eventos';
import {
  calcularTotais,
  Orcamento,
  PecaOrcada,
  ServicoOrcado,
  SituacaoPecaOrcada,
  StatusOrcamento,
  TipoOrcamento,
} from './itens';
import { StatusOS, transicaoPermitida } from './status-os';

export interface RegistroHistorico {
  status: StatusOS;
  em: Date;
  por: string | null;
}

interface PropsOrdemServico {
  numero: string;
  clienteId: string;
  veiculoId: string;
  problemaRelatado: string;
  status: StatusOS;
  versao: number;
  pago: boolean;
  pagoEm: Date | null;
  criadoEm: Date;
  iniciadoExecucaoEm: Date | null;
  finalizadoEm: Date | null;
  historico: RegistroHistorico[];
  orcamentos: Orcamento[];
}

/**
 * Raiz de agregado. Toda mudança de status passa por `transicionarPara`.
 *
 * Uma OS tem um orçamento INICIAL (do diagnóstico) e zero ou mais ADICIONAL.
 * Aprovar/recusar o INICIAL move o status; os ADICIONAL só liberam o trabalho
 * extra. A OS só finaliza quando nenhum orçamento está pendente.
 */
export class OrdemServico extends AgregadoRaiz<string> {
  private constructor(
    id: string,
    private props: PropsOrdemServico,
  ) {
    super(id);
  }

  static abrir(entrada: {
    id: string;
    numero: string;
    clienteId: string;
    veiculoId: string;
    problemaRelatado: string;
    por?: string | null;
  }): OrdemServico {
    if (!entrada.problemaRelatado || !entrada.problemaRelatado.trim()) {
      throw new ErroValidacao('Problema relatado é obrigatório.');
    }
    const agora = new Date();
    const os = new OrdemServico(entrada.id, {
      numero: entrada.numero,
      clienteId: entrada.clienteId,
      veiculoId: entrada.veiculoId,
      problemaRelatado: entrada.problemaRelatado.trim(),
      status: StatusOS.RECEBIDA,
      versao: 0,
      pago: false,
      pagoEm: null,
      criadoEm: agora,
      iniciadoExecucaoEm: null,
      finalizadoEm: null,
      historico: [
        { status: StatusOS.RECEBIDA, em: agora, por: entrada.por ?? null },
      ],
      orcamentos: [],
    });
    os.registrarEvento(new OSAberta(os.id, os.numero));
    return os;
  }

  static restaurar(id: string, props: PropsOrdemServico): OrdemServico {
    return new OrdemServico(id, props);
  }

  /**
   * Rejeita transições fora da ordem válida, grava o histórico e o evento.
   * `iniciadoExecucaoEm` é marcado aqui — venha da aprovação ou da peça que
   * chegou.
   */
  transicionarPara(novo: StatusOS, por?: string | null): void {
    if (!transicaoPermitida(this.props.status, novo)) {
      throw new ErroTransicaoInvalida(
        `Transição inválida: de ${this.props.status} para ${novo}.`,
      );
    }
    const anterior = this.props.status;
    const agora = new Date();
    const ultimo = this.props.historico[this.props.historico.length - 1];
    const desde = ultimo?.em ?? agora;
    this.props.status = novo;
    if (novo === StatusOS.EM_EXECUCAO && !this.props.iniciadoExecucaoEm) {
      this.props.iniciadoExecucaoEm = agora;
    }
    this.props.historico.push({
      status: novo,
      em: agora,
      por: por ?? null,
    });
    const minutos = Math.round((agora.getTime() - desde.getTime()) / 600) / 100;
    this.registrarEvento(
      new StatusOSAlterado(this.id, anterior, novo, minutos),
    );
    if (novo === StatusOS.CANCELADA) {
      this.registrarEvento(new OSCancelada(this.id));
    }
  }

  /** O mecânico assume a OS: Recebida → Em diagnóstico. */
  iniciarDiagnostico(por?: string | null): void {
    this.transicionarPara(StatusOS.EM_DIAGNOSTICO, por);
  }

  /**
   * Cria o orçamento INICIAL com os preços já congelados pela aplicação e o
   * envia ao cliente: Em diagnóstico → Aguardando aprovação.
   */
  registrarDiagnostico(entrada: {
    servicos: ServicoOrcado[];
    pecas: PecaOrcada[];
    orcamentoId: string;
    por?: string | null;
  }): void {
    if (this.props.status !== StatusOS.EM_DIAGNOSTICO) {
      throw new ErroTransicaoInvalida(
        'O diagnóstico precisa ser iniciado antes de registrar serviços e peças.',
      );
    }
    if (entrada.servicos.length === 0 && entrada.pecas.length === 0) {
      throw new ErroValidacao(
        'O diagnóstico precisa de ao menos um serviço ou peça.',
      );
    }
    if (this.orcamentoInicial()) {
      throw new ErroValidacao('Esta OS já tem orçamento inicial.');
    }

    const agora = new Date();
    const orcamento: Orcamento = {
      id: entrada.orcamentoId,
      tipo: TipoOrcamento.INICIAL,
      descricao: null,
      totalServicos: 0,
      totalPecas: 0,
      total: 0,
      status: StatusOrcamento.ENVIADO,
      criadoEm: agora,
      enviadoEm: agora,
      respondidoEm: null,
      servicos: entrada.servicos,
      pecas: entrada.pecas,
    };
    calcularTotais(orcamento);
    this.props.orcamentos.push(orcamento);

    // Concluir o diagnóstico já envia o orçamento ao cliente.
    this.transicionarPara(StatusOS.AGUARDANDO_APROVACAO, entrada.por);

    this.registrarEvento(new DiagnosticoConcluido(this.id));
    this.registrarEvento(
      new OrcamentoGerado(
        this.id,
        orcamento.id,
        orcamento.tipo,
        orcamento.total,
      ),
    );
    this.registrarEvento(
      new OrcamentoEnviado(
        this.id,
        this.props.numero,
        orcamento.id,
        orcamento.tipo,
      ),
    );
  }

  /**
   * Marca as peças (DISPONIVEL → RESERVADA, EM_COTACAO → ENCOMENDADA) e emite
   * o evento com a situação ORIGINAL, que é o que o Estoque precisa saber.
   *
   * INICIAL leva a OS para Em execução, ou Aguardando peça se algo foi
   * encomendado. ADICIONAL não mexe no status — mas barra a finalização até a
   * peça chegar.
   */
  aprovarOrcamento(orcamentoId: string, por?: string | null): void {
    const orcamento = this.orcamentoNoEstado(
      orcamentoId,
      StatusOrcamento.ENVIADO,
    );

    const itensParaEstoque = this.capturarPecasParaEstoque(orcamento);

    orcamento.status = StatusOrcamento.APROVADO;
    orcamento.respondidoEm = new Date();
    this.reservarPecasDoOrcamento(orcamento);

    if (orcamento.tipo === TipoOrcamento.INICIAL) {
      const destino = this.temPecaEncomendada()
        ? StatusOS.AGUARDANDO_PECA
        : StatusOS.EM_EXECUCAO;
      this.transicionarPara(destino, por);
    }

    this.registrarEvento(
      new OrcamentoAprovado(
        this.id,
        orcamento.id,
        orcamento.tipo,
        itensParaEstoque,
      ),
    );
  }

  /** INICIAL recusado cancela a OS; ADICIONAL só dispensa o trabalho extra. */
  recusarOrcamento(
    orcamentoId: string,
    justificativa?: string | null,
    por?: string | null,
  ): void {
    const orcamento = this.orcamentoNoEstado(
      orcamentoId,
      StatusOrcamento.ENVIADO,
    );
    orcamento.status = StatusOrcamento.RECUSADO;
    orcamento.respondidoEm = new Date();

    if (orcamento.tipo === TipoOrcamento.INICIAL) {
      this.transicionarPara(StatusOS.CANCELADA, por);
    }

    this.registrarEvento(
      new OrcamentoRecusado(
        this.id,
        orcamento.id,
        orcamento.tipo,
        justificativa ?? null,
      ),
    );
  }

  /** Reparo descoberto na execução. Nasce ENVIADO; a OS segue Em execução. */
  adicionarOrcamentoAdicional(entrada: {
    id: string;
    descricao: string;
    servicos: ServicoOrcado[];
    pecas: PecaOrcada[];
    por?: string | null;
  }): void {
    if (this.props.status !== StatusOS.EM_EXECUCAO) {
      throw new ErroTransicaoInvalida(
        'Orçamento adicional só pode ser lançado com a OS em execução.',
      );
    }
    if (entrada.servicos.length === 0 && entrada.pecas.length === 0) {
      throw new ErroValidacao(
        'Orçamento adicional precisa de ao menos um serviço ou peça.',
      );
    }

    const agora = new Date();
    const orcamento: Orcamento = {
      id: entrada.id,
      tipo: TipoOrcamento.ADICIONAL,
      descricao: entrada.descricao,
      totalServicos: 0,
      totalPecas: 0,
      total: 0,
      status: StatusOrcamento.ENVIADO,
      criadoEm: agora,
      enviadoEm: agora,
      respondidoEm: null,
      servicos: entrada.servicos,
      pecas: entrada.pecas,
    };
    calcularTotais(orcamento);
    this.props.orcamentos.push(orcamento);

    this.registrarEvento(
      new OrcamentoGerado(
        this.id,
        orcamento.id,
        orcamento.tipo,
        orcamento.total,
      ),
    );
    this.registrarEvento(
      new OrcamentoEnviado(
        this.id,
        this.props.numero,
        orcamento.id,
        orcamento.tipo,
      ),
    );
  }

  /**
   * A peça encomendada chegou: marca as linhas como RESERVADA e retoma a
   * execução se não restar nenhuma pendente. Idempotente.
   */
  registrarRecebimentoDePeca(pecaId: string, por?: string | null): void {
    let alterou = false;
    for (const orcamento of this.props.orcamentos) {
      if (orcamento.status !== StatusOrcamento.APROVADO) {
        continue;
      }
      for (const peca of orcamento.pecas) {
        if (
          peca.pecaId === pecaId &&
          peca.situacao === SituacaoPecaOrcada.ENCOMENDADA
        ) {
          peca.situacao = SituacaoPecaOrcada.RESERVADA;
          alterou = true;
        }
      }
    }

    if (!alterou) {
      return;
    }

    if (
      this.props.status === StatusOS.AGUARDANDO_PECA &&
      !this.temPecaEncomendada()
    ) {
      // Retomada automática (a peça chegou): o ator é o próprio sistema, não
      // um operador — registra "sistema" em vez de null no histórico.
      this.transicionarPara(StatusOS.EM_EXECUCAO, por ?? 'sistema');
    }
  }

  /**
   * Bloqueia se houver orçamento pendente de resposta ou peça encomendada por
   * chegar. O evento dispara a baixa das peças reservadas no estoque.
   */
  concluirExecucao(por?: string | null): void {
    if (this.temOrcamentoPendente()) {
      throw new ErroValidacao(
        'Há orçamento aguardando resposta do cliente; não é possível concluir.',
      );
    }
    if (this.temPecaEncomendada()) {
      throw new ErroValidacao(
        'Há peça encomendada aguardando chegada; não é possível concluir.',
      );
    }
    this.props.finalizadoEm = new Date();
    this.transicionarPara(StatusOS.FINALIZADA, por);
    this.registrarEvento(
      new ExecucaoConcluida(this.id, this.tempoExecucaoMinutos()),
    );
  }

  /** Libera a entrega. Não é transição de status. */
  marcarPago(): void {
    if (this.props.status !== StatusOS.FINALIZADA) {
      throw new ErroTransicaoInvalida(
        'O pagamento só pode ser confirmado com a OS finalizada.',
      );
    }
    if (this.props.pago) {
      throw new ErroValidacao('Esta OS já está paga.');
    }
    this.props.pago = true;
    this.props.pagoEm = new Date();
    this.registrarEvento(new PagamentoConfirmado(this.id));
  }

  /** Finalizada → Entregue. O veículo fica retido até o pagamento. */
  entregar(por?: string | null): void {
    // Estado antes do pagamento: uma OS cancelada deve falhar por transição
    // inválida, não por uma mensagem de pagamento que mascara a causa.
    if (!transicaoPermitida(this.props.status, StatusOS.ENTREGUE)) {
      throw new ErroTransicaoInvalida(
        `Transição inválida: de ${this.props.status} para ${StatusOS.ENTREGUE}.`,
      );
    }
    if (!this.props.pago) {
      throw new ErroValidacao(
        'A entrega exige pagamento confirmado (pago = true).',
      );
    }
    this.transicionarPara(StatusOS.ENTREGUE, por);
    this.registrarEvento(new VeiculoEntregue(this.id, this.props.numero));
  }

  private orcamentoInicial(): Orcamento | undefined {
    return this.props.orcamentos.find((o) => o.tipo === TipoOrcamento.INICIAL);
  }

  private orcamentoNoEstado(
    orcamentoId: string,
    esperado: StatusOrcamento,
  ): Orcamento {
    const orcamento = this.props.orcamentos.find((o) => o.id === orcamentoId);
    if (!orcamento) {
      throw new ErroNaoEncontrado('Orçamento não encontrado.', { orcamentoId });
    }
    if (orcamento.status !== esperado) {
      throw new ErroTransicaoInvalida(
        `Orçamento precisa estar ${esperado}; está ${orcamento.status}.`,
      );
    }
    return orcamento;
  }

  private capturarPecasParaEstoque(orcamento: Orcamento): ItemPecaAprovado[] {
    return orcamento.pecas.map((i) => ({
      pecaId: i.pecaId,
      quantidade: i.quantidade,
      situacao:
        i.situacao === SituacaoPecaOrcada.DISPONIVEL
          ? 'DISPONIVEL'
          : 'EM_COTACAO',
    }));
  }

  private reservarPecasDoOrcamento(orcamento: Orcamento): void {
    for (const item of orcamento.pecas) {
      item.situacao =
        item.situacao === SituacaoPecaOrcada.DISPONIVEL
          ? SituacaoPecaOrcada.RESERVADA
          : SituacaoPecaOrcada.ENCOMENDADA;
    }
  }

  private temPecaEncomendada(): boolean {
    return this.props.orcamentos.some(
      (o) =>
        o.status === StatusOrcamento.APROVADO &&
        o.pecas.some((p) => p.situacao === SituacaoPecaOrcada.ENCOMENDADA),
    );
  }

  /** Orçamentos que ainda valem: o recusado saiu do escopo da OS. */
  private orcamentosVigentes(): Orcamento[] {
    return this.props.orcamentos.filter(
      (o) => o.status !== StatusOrcamento.RECUSADO,
    );
  }

  private temOrcamentoPendente(): boolean {
    return this.props.orcamentos.some(
      (o) =>
        o.status === StatusOrcamento.GERADO ||
        o.status === StatusOrcamento.ENVIADO,
    );
  }

  private tempoExecucaoMinutos(): number | null {
    if (!this.props.iniciadoExecucaoEm || !this.props.finalizadoEm) {
      return null;
    }
    const ms =
      this.props.finalizadoEm.getTime() -
      this.props.iniciadoExecucaoEm.getTime();
    return Math.round(ms / 60000);
  }

  get numero(): string {
    return this.props.numero;
  }
  get clienteId(): string {
    return this.props.clienteId;
  }
  get veiculoId(): string {
    return this.props.veiculoId;
  }
  get problemaRelatado(): string {
    return this.props.problemaRelatado;
  }
  get status(): StatusOS {
    return this.props.status;
  }
  get versao(): number {
    return this.props.versao;
  }
  get pago(): boolean {
    return this.props.pago;
  }
  get criadoEm(): Date {
    return this.props.criadoEm;
  }
  get historico(): readonly RegistroHistorico[] {
    return this.props.historico;
  }
  get orcamentos(): readonly Orcamento[] {
    return this.props.orcamentos;
  }
  get orcamento(): Orcamento | null {
    return this.orcamentoInicial() ?? null;
  }
  /**
   * Serviços e peças da OS como um todo: as linhas de todos os orçamentos que
   * o cliente não recusou (o inicial mais os adicionais que seguiram em pé).
   *
   * As linhas continuam pertencendo ao orçamento que as congelou — isto aqui é
   * só a leitura consolidada. Por isso não somam quantidades de itens iguais:
   * duas linhas do mesmo serviço em orçamentos diferentes podem ter preços
   * acordados diferentes, e achatá-las apagaria justamente o preço congelado.
   *
   * Numa OS recém-aberta os dois vêm vazios — o array existe desde a abertura
   * e o diagnóstico o preenche.
   */
  get servicos(): readonly ServicoOrcado[] {
    return this.orcamentosVigentes().flatMap((o) => o.servicos);
  }
  get pecas(): readonly PecaOrcada[] {
    return this.orcamentosVigentes().flatMap((o) => o.pecas);
  }
  get iniciadoExecucaoEm(): Date | null {
    return this.props.iniciadoExecucaoEm;
  }
  get finalizadoEm(): Date | null {
    return this.props.finalizadoEm;
  }
  get pagoEm(): Date | null {
    return this.props.pagoEm;
  }
}
