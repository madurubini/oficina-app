import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ClienteAutenticado } from '../guards/cliente.guard';

export const ClienteAtual = createParamDecorator(
  (_dados: unknown, ctx: ExecutionContext): ClienteAutenticado => {
    const request = ctx.switchToHttp().getRequest();
    return request.cliente;
  },
);
