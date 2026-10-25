import type { IncomingMessage, ServerResponse } from 'http';
import { agenteInerte, carregarAgenteApm } from './agente-apm';
import { gerarRequestId, opcoesDeLog } from './logs';

function requisicao(cabecalhos: Record<string, string> = {}) {
  const req = { headers: cabecalhos } as unknown as IncomingMessage;
  const res = { setHeader: jest.fn() } as unknown as ServerResponse & {
    setHeader: jest.Mock;
  };
  const agente = { ...agenteInerte, addCustomAttribute: jest.fn() };
  return { req, res, agente };
}

describe('carregarAgenteApm', () => {
  it('sem NEW_RELIC_ENABLED=true usa o agente inerte (não carrega o newrelic)', () => {
    expect(carregarAgenteApm({})).toBe(agenteInerte);
    expect(carregarAgenteApm({ NEW_RELIC_ENABLED: 'false' })).toBe(
      agenteInerte,
    );
  });
});

describe('gerarRequestId', () => {
  it('reaproveita o x-request-id de quem chamou e devolve na resposta', () => {
    const { req, res, agente } = requisicao({ 'x-request-id': 'abc-123' });

    expect(gerarRequestId(req, res, agente)).toBe('abc-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'abc-123');
    expect(agente.addCustomAttribute).toHaveBeenCalledWith(
      'requestId',
      'abc-123',
    );
  });

  it('aceita o id do API Gateway, que vem em base64', () => {
    const { req, res, agente } = requisicao({
      'x-request-id': 'F0HpDiyQIAMEVmg=',
    });

    expect(gerarRequestId(req, res, agente)).toBe('F0HpDiyQIAMEVmg=');
  });

  it('gera um id novo quando não vem nenhum', () => {
    const { req, res, agente } = requisicao();

    expect(gerarRequestId(req, res, agente, () => 'novo-id')).toBe('novo-id');
  });

  it('ignora um id recebido com caracteres estranhos (injeção no log)', () => {
    const { req, res, agente } = requisicao({
      'x-request-id': 'a\nlinha falsa',
    });

    expect(gerarRequestId(req, res, agente, () => 'novo-id')).toBe('novo-id');
  });
});

describe('opcoesDeLog', () => {
  it('fica em silêncio nos testes e usa info por padrão', () => {
    const nivel = (ambiente: NodeJS.ProcessEnv) =>
      (opcoesDeLog(agenteInerte, ambiente).pinoHttp as { level: string }).level;

    expect(nivel({ NODE_ENV: 'test' })).toBe('silent');
    expect(nivel({ NODE_ENV: 'production' })).toBe('info');
    expect(nivel({ LOG_LEVEL: 'debug' })).toBe('debug');
  });

  it('não gera log de acesso para as sondas de saúde', () => {
    const pino = opcoesDeLog(agenteInerte, {}).pinoHttp as {
      autoLogging: { ignore: (req: { url?: string }) => boolean };
    };

    expect(pino.autoLogging.ignore({ url: '/api/v1/health/ready' })).toBe(true);
    expect(pino.autoLogging.ignore({ url: '/api/v1/clientes' })).toBe(false);
  });
});
