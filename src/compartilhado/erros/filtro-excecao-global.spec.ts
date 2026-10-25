import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import {
  ErroConflito,
  ErroDominio,
  ErroNaoAutenticado,
  ErroNaoAutorizado,
  ErroNaoEncontrado,
  ErroTransicaoInvalida,
  ErroValidacao,
} from './erros-dominio';
import { FiltroExcecaoGlobal } from './filtro-excecao-global';

function capturarResposta(): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('FiltroExcecaoGlobal', () => {
  it.each([
    [new ErroValidacao('inválido'), 400, 'VALIDACAO'],
    [new ErroNaoAutenticado('sem token'), 401, 'NAO_AUTENTICADO'],
    [new ErroNaoAutorizado('papel insuficiente'), 403, 'NAO_AUTORIZADO'],
    [new ErroNaoEncontrado('sumiu'), 404, 'NAO_ENCONTRADO'],
    [new ErroConflito('duplicado'), 409, 'CONFLITO'],
    [new ErroTransicaoInvalida('não pode'), 422, 'TRANSICAO_INVALIDA'],
  ])('mapeia %s para o status do contrato', (erro, esperado, codigo) => {
    const { host, status, json } = capturarResposta();

    new FiltroExcecaoGlobal().catch(erro, host);

    expect(status).toHaveBeenCalledWith(esperado);
    expect(json).toHaveBeenCalledWith({
      erro: { codigo, mensagem: (erro as ErroDominio).message, detalhes: null },
    });
  });

  it('devolve os detalhes do erro de domínio quando existem', () => {
    const { host, json } = capturarResposta();

    new FiltroExcecaoGlobal().catch(
      new ErroConflito('documento em uso', { documento: '111' }),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      erro: {
        codigo: 'CONFLITO',
        mensagem: 'documento em uso',
        detalhes: { documento: '111' },
      },
    });
  });

  it('normaliza as mensagens do class-validator em lista', () => {
    const { host, status, json } = capturarResposta();

    new FiltroExcecaoGlobal().catch(
      new BadRequestException({
        message: ['inicio deve ser ISO-8601', 'fim deve ser ISO-8601'],
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      erro: {
        codigo: 'VALIDACAO',
        mensagem: 'inicio deve ser ISO-8601; fim deve ser ISO-8601',
        detalhes: ['inicio deve ser ISO-8601', 'fim deve ser ISO-8601'],
      },
    });
  });

  it('usa o tradutor de infraestrutura antes de desistir para 500', () => {
    const { host, status, json } = capturarResposta();
    const erroDeInfra = new Error('unique constraint');
    const tradutor = jest
      .fn()
      .mockImplementation((erro: unknown) =>
        erro === erroDeInfra ? new ErroConflito('já existe') : null,
      );

    new FiltroExcecaoGlobal({ tradutores: [tradutor] }).catch(
      erroDeInfra,
      host,
    );

    expect(tradutor).toHaveBeenCalledWith(erroDeInfra);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      erro: { codigo: 'CONFLITO', mensagem: 'já existe', detalhes: null },
    });
  });

  it('erro desconhecido vira 500 com id de ocorrência (sem vazar a causa)', () => {
    const { host, status, json } = capturarResposta();

    new FiltroExcecaoGlobal({
      gerarIdDaOcorrencia: () => 'ocorrencia-1',
    }).catch(new Error('detalhe interno que não pode vazar'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      erro: {
        codigo: 'ERRO_INTERNO',
        mensagem: 'Erro interno do servidor.',
        detalhes: { idDaOcorrencia: 'ocorrencia-1' },
      },
    });
  });

  it('avisa o APM só do erro não tratado, com o id de ocorrência', () => {
    const aoErroInesperado = jest.fn();
    const filtro = new FiltroExcecaoGlobal({
      gerarIdDaOcorrencia: () => 'ocorrencia-2',
      aoErroInesperado,
    });
    const erro = new Error('falhou');

    filtro.catch(new ErroValidacao('inválido'), capturarResposta().host);
    filtro.catch(erro, capturarResposta().host);

    expect(aoErroInesperado).toHaveBeenCalledTimes(1);
    expect(aoErroInesperado).toHaveBeenCalledWith(erro, 'ocorrencia-2');
  });
});
