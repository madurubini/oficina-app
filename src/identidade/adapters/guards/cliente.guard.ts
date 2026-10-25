import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { ErroNaoAutenticado } from '../../../compartilhado/erros/erros-dominio';
import {
  TOKEN_DO_CLIENTE,
  TokenDoCliente,
} from '../../use-cases/token-do-cliente';

export interface ClienteAutenticado {
  id: string;
}

/**
 * Protege as rotas do cliente (`/acompanhamento`): exige o token emitido pelo
 * login por CPF e coloca o cliente em `request.cliente`, lido pelo decorator
 * `@ClienteAtual()`. Se a OS pertence a esse cliente é regra do módulo de OS,
 * conferida no caso de uso — o guard não conhece ordens de serviço.
 */
@Injectable()
export class ClienteGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_DO_CLIENTE)
    private readonly tokens: TokenDoCliente,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { cliente?: ClienteAutenticado }>();

    const header = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new ErroNaoAutenticado('Token do cliente ausente.');
    }

    const payload = await this.tokens.verificar(header.slice('Bearer '.length));
    if (!payload) {
      throw new ErroNaoAutenticado('Token do cliente inválido ou expirado.');
    }

    req.cliente = { id: payload.clienteId };
    return true;
  }
}
