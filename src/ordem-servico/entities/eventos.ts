import { EventoDominio } from '../../compartilhado/dominio/evento-dominio';
import type { TipoOrcamento } from './itens';
import { StatusOS } from './status-os';

/**
 * Situação ORIGINAL do diagnóstico: é como o Estoque decide entre reservar
 * (DISPONIVEL) e encomendar (EM_COTACAO). String simples, e não o enum
 * interno, para o Estoque não depender do módulo de OS.
 */
export type SituacaoPecaNoOrcamento = 'DISPONIVEL' | 'EM_COTACAO';

export interface ItemPecaAprovado {
  pecaId: string;
  quantidade: number;
  situacao: SituacaoPecaNoOrcamento;
}

export class OSAberta extends EventoDominio {
  constructor(
    readonly ordemId: string,
    readonly numero: string,
  ) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.os-aberta';
  }
}

/**
 * Gravado também em historico_status. Leva quanto tempo a OS ficou no status
 * anterior: é o que o painel de "tempo médio por status" soma.
 */
export class StatusOSAlterado extends EventoDominio {
  constructor(
    readonly ordemId: string,
    readonly de: StatusOS,
    readonly para: StatusOS,
    readonly minutosNoStatusAnterior: number,
  ) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.status-alterado';
  }
}

/** OS cancelada (→ estoque cancela encomendas pendentes da OS). */
export class OSCancelada extends EventoDominio {
  constructor(readonly ordemId: string) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.os-cancelada';
  }
}

export class DiagnosticoConcluido extends EventoDominio {
  constructor(readonly ordemId: string) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.diagnostico-concluido';
  }
}

export class OrcamentoGerado extends EventoDominio {
  constructor(
    readonly ordemId: string,
    readonly orcamentoId: string,
    readonly tipo: TipoOrcamento,
    readonly total: number,
  ) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.orcamento-gerado';
  }
}

/** Orçamento enviado ao cliente (→ notificacoes avisa/pede autorização). */
export class OrcamentoEnviado extends EventoDominio {
  constructor(
    readonly ordemId: string,
    readonly numero: string,
    readonly orcamentoId: string,
    readonly tipo: TipoOrcamento,
  ) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.orcamento-enviado';
  }
}

/** → estoque reserva as disponíveis e encomenda as faltantes. */
export class OrcamentoAprovado extends EventoDominio {
  constructor(
    readonly ordemId: string,
    readonly orcamentoId: string,
    readonly tipo: TipoOrcamento,
    readonly itensPeca: ItemPecaAprovado[],
  ) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.orcamento-aprovado';
  }
}

/** INICIAL recusado cancela a OS; ADICIONAL segue com o que foi aprovado. */
export class OrcamentoRecusado extends EventoDominio {
  constructor(
    readonly ordemId: string,
    readonly orcamentoId: string,
    readonly tipo: TipoOrcamento,
    readonly justificativa: string | null,
  ) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.orcamento-recusado';
  }
}

/** Execução concluída (→ estoque baixa as peças reservadas). */
export class ExecucaoConcluida extends EventoDominio {
  constructor(
    readonly ordemId: string,
    readonly tempoExecucaoMin: number | null,
  ) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.execucao-concluida';
  }
}

export class PagamentoConfirmado extends EventoDominio {
  constructor(readonly ordemId: string) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.pagamento-confirmado';
  }
}

export class VeiculoEntregue extends EventoDominio {
  constructor(
    readonly ordemId: string,
    readonly numero: string,
  ) {
    super();
  }
  get nomeEvento(): string {
    return 'ordem-servico.veiculo-entregue';
  }
}
