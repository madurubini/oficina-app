import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AGENTE_APM,
  AgenteApm,
} from '../compartilhado/infraestrutura/observabilidade/agente-apm';
import type {
  OSAberta,
  StatusOSAlterado,
} from '../ordem-servico/entities/eventos';

/** Tipo do evento no New Relic: `SELECT ... FROM OrdemServicoStatus`. */
export const EVENTO_STATUS_OS = 'OrdemServicoStatus';

/**
 * Traduz os eventos de domínio da OS em eventos de negócio no New Relic. Os
 * dashboards (OS por dia, tempo médio por status) consultam esses eventos, e
 * não o banco. Como os outros assinantes, só conhece o contrato do evento
 * (`import type`), não o módulo de OS.
 */
@Injectable()
export class EventosDeNegocio {
  constructor(@Inject(AGENTE_APM) private readonly agente: AgenteApm) {}

  @OnEvent('ordem-servico.os-aberta')
  aoAbrir(evento: OSAberta): void {
    this.agente.recordCustomEvent(EVENTO_STATUS_OS, {
      ordemId: evento.ordemId,
      numero: evento.numero,
      de: '',
      para: 'RECEBIDA',
      minutosNoStatusAnterior: 0,
    });
  }

  @OnEvent('ordem-servico.status-alterado')
  aoMudarStatus(evento: StatusOSAlterado): void {
    this.agente.recordCustomEvent(EVENTO_STATUS_OS, {
      ordemId: evento.ordemId,
      de: evento.de,
      para: evento.para,
      minutosNoStatusAnterior: evento.minutosNoStatusAnterior,
    });
  }
}
