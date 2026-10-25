export const AGENTE_APM = Symbol('AgenteApm');

export type AtributosApm = Record<string, string | number | boolean>;

/**
 * O pedaço da API do agente do New Relic que a aplicação usa. Fica atrás de
 * uma interface para os testes (e o ambiente local sem conta) não carregarem
 * o agente de verdade.
 */
export interface AgenteApm {
  /** Evento de negócio, consultável por NRQL (`FROM <tipo>`). */
  recordCustomEvent(tipo: string, atributos: AtributosApm): void;
  /** Atributo na transação (requisição) em andamento. */
  addCustomAttribute(nome: string, valor: string | number | boolean): void;
  /** Erro com stack trace, ligado à transação em andamento. */
  noticeError(erro: Error, atributos?: AtributosApm): void;
}

export const agenteInerte: AgenteApm = {
  recordCustomEvent: () => undefined,
  addCustomAttribute: () => undefined,
  noticeError: () => undefined,
};

/**
 * O agente instrumenta HTTP, Prisma e logs quando a aplicação sobe com
 * `node -r newrelic` (Dockerfile). Aqui só se pega a API dele, e apenas quando
 * está ligado (`NEW_RELIC_ENABLED=true`): sem isso, o `require` iniciaria um
 * agente sem license key.
 */
export function carregarAgenteApm(
  ambiente: NodeJS.ProcessEnv = process.env,
): AgenteApm {
  if (ambiente.NEW_RELIC_ENABLED !== 'true') return agenteInerte;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('newrelic') as AgenteApm;
}
