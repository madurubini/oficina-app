import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import {
  ErroConflito,
  ErroDominio,
  ErroNaoAutenticado,
  ErroNaoAutorizado,
  ErroNaoEncontrado,
  ErroTransicaoInvalida,
  ErroValidacao,
} from './erros-dominio';

/**
 * Converte erro de infraestrutura em erro de domínio, ou `null` se não souber.
 * Existe para o filtro não conhecer o Prisma: quem conhece é o tradutor.
 */
export type TradutorDeErro = (erro: unknown) => ErroDominio | null;

export interface OpcoesFiltroExcecao {
  /** Tradutores de erro de infraestrutura → erro de domínio, em ordem. */
  tradutores?: TradutorDeErro[];
  /** Injetável para manter os testes determinísticos. */
  gerarIdDaOcorrencia?: () => string;
  /** Chamado com o erro não tratado (500): o APM guarda a stack trace. */
  aoErroInesperado?: (erro: unknown, idDaOcorrencia: string) => void;
}

/**
 * Traduz qualquer exceção para o envelope `{ erro: { codigo, mensagem,
 * detalhes } }`. O que não é reconhecido vira 500 com um id de ocorrência: o
 * mesmo id vai para o log e para a resposta, ligando um ao outro sem expor a
 * stack ao cliente.
 */
@Catch()
export class FiltroExcecaoGlobal implements ExceptionFilter {
  private readonly logger = new Logger(FiltroExcecaoGlobal.name);
  private readonly tradutores: TradutorDeErro[];
  private readonly gerarIdDaOcorrencia: () => string;
  private readonly aoErroInesperado: (erro: unknown, id: string) => void;

  constructor(opcoes: OpcoesFiltroExcecao = {}) {
    this.tradutores = opcoes.tradutores ?? [];
    this.gerarIdDaOcorrencia = opcoes.gerarIdDaOcorrencia ?? randomUUID;
    this.aoErroInesperado = opcoes.aoErroInesperado ?? (() => undefined);
  }

  catch(excecao: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const resposta = ctx.getResponse<Response>();

    const { status, codigo, mensagem, detalhes } = this.traduzir(excecao);

    resposta.status(status).json({
      erro: { codigo, mensagem, detalhes: detalhes ?? null },
    });
  }

  private traduzir(excecao: unknown): {
    status: number;
    codigo: string;
    mensagem: string;
    detalhes?: unknown;
  } {
    const erroDominio =
      excecao instanceof ErroDominio ? excecao : this.traduzirInfra(excecao);

    if (erroDominio) {
      return {
        status: this.statusDoErroDominio(erroDominio),
        codigo: erroDominio.codigo,
        mensagem: erroDominio.message,
        detalhes: erroDominio.detalhes,
      };
    }

    if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      const corpo = excecao.getResponse();
      const mensagens = this.mensagensDe(corpo, excecao.message);
      return {
        status,
        codigo: this.codigoPadraoPorStatus(status),
        mensagem: mensagens.join('; '),
        // Um formato só, venha do class-validator (array) ou de string única.
        detalhes: mensagens,
      };
    }

    const idDaOcorrencia = this.gerarIdDaOcorrencia();
    this.logger.error(`Erro não tratado [${idDaOcorrencia}]`, excecao);
    this.aoErroInesperado(excecao, idDaOcorrencia);
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      codigo: 'ERRO_INTERNO',
      mensagem: 'Erro interno do servidor.',
      detalhes: { idDaOcorrencia },
    };
  }

  /** Primeiro tradutor que reconhecer o erro de infraestrutura ganha. */
  private traduzirInfra(excecao: unknown): ErroDominio | null {
    for (const traduzir of this.tradutores) {
      const erro = traduzir(excecao);
      if (erro) return erro;
    }
    return null;
  }

  private mensagensDe(corpo: unknown, fallback: string): string[] {
    if (typeof corpo === 'string') return [corpo];
    const mensagem = (corpo as Record<string, unknown> | null)?.message;
    if (Array.isArray(mensagem)) return mensagem as string[];
    if (typeof mensagem === 'string') return [mensagem];
    return [fallback];
  }

  private statusDoErroDominio(erro: ErroDominio): number {
    if (erro instanceof ErroValidacao) return HttpStatus.BAD_REQUEST;
    if (erro instanceof ErroNaoAutenticado) return HttpStatus.UNAUTHORIZED;
    if (erro instanceof ErroNaoAutorizado) return HttpStatus.FORBIDDEN;
    if (erro instanceof ErroNaoEncontrado) return HttpStatus.NOT_FOUND;
    if (erro instanceof ErroConflito) return HttpStatus.CONFLICT;
    if (erro instanceof ErroTransicaoInvalida)
      return HttpStatus.UNPROCESSABLE_ENTITY;
    return HttpStatus.BAD_REQUEST;
  }

  private codigoPadraoPorStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDACAO';
      case HttpStatus.UNAUTHORIZED:
        return 'NAO_AUTENTICADO';
      case HttpStatus.FORBIDDEN:
        return 'NAO_AUTORIZADO';
      case HttpStatus.NOT_FOUND:
        return 'NAO_ENCONTRADO';
      case HttpStatus.CONFLICT:
        return 'CONFLITO';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'TRANSICAO_INVALIDA';
      default:
        return 'ERRO';
    }
  }
}
