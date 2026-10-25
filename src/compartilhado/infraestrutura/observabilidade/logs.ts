import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Params } from 'nestjs-pino';
import { AgenteApm } from './agente-apm';

export const CABECALHO_REQUEST_ID = 'x-request-id';

/** Só aceita um id de quem chama (o API Gateway) se for curto e sem símbolos. */
const ID_ACEITO = /^[\w-]{1,64}$/;

/**
 * Cada requisição ganha um id: o que veio no `x-request-id` (o API Gateway
 * manda o dele) ou um novo. Ele volta na resposta, vai para todas as linhas de
 * log da requisição e para a transação no New Relic — o mesmo valor liga log,
 * trace e a reclamação do cliente.
 */
export function gerarRequestId(
  req: IncomingMessage,
  res: ServerResponse,
  agente: AgenteApm,
  novoId: () => string = randomUUID,
): string {
  const recebido = req.headers[CABECALHO_REQUEST_ID];
  const id =
    typeof recebido === 'string' && ID_ACEITO.test(recebido)
      ? recebido
      : novoId();
  res.setHeader(CABECALHO_REQUEST_ID, id);
  agente.addCustomAttribute('requestId', id);
  return id;
}

/**
 * Logs em JSON (pino), uma linha por evento. O agente do New Relic encaminha
 * essas linhas já ligadas ao trace (`trace.id`/`span.id`), sem coletor à parte.
 */
export function opcoesDeLog(
  agente: AgenteApm,
  ambiente: NodeJS.ProcessEnv = process.env,
): Params {
  return {
    pinoHttp: {
      level:
        ambiente.LOG_LEVEL ??
        (ambiente.NODE_ENV === 'test' ? 'silent' : 'info'),
      genReqId: (req, res) => gerarRequestId(req, res, agente),
      customAttributeKeys: { reqId: 'requestId' },
      // Nas linhas de log da aplicação vai só o requestId, não a requisição toda.
      quietReqLogger: true,
      serializers: {
        req: (req: { method: string; url: string }) => ({
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      // As sondas do Kubernetes batem a cada 10 s: não viram log de acesso.
      autoLogging: {
        ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false,
      },
    },
  };
}
