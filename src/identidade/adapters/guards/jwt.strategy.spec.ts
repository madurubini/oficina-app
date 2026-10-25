import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErroNaoAutorizado } from '../../../compartilhado/erros/erros-dominio';
import { Papel } from '../../entities/usuario';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const config = {
    get: () => 'segredo-teste',
  } as unknown as ConfigService;
  const strategy = new JwtStrategy(config);

  it('devolve o operador a partir do token de login', async () => {
    await expect(
      strategy.validate({ sub: 'u-1', username: 'gestor', papel: 'GESTOR' }),
    ).resolves.toEqual({ id: 'u-1', username: 'gestor', papel: 'GESTOR' });
  });

  it('401 quando o token não tem sub', async () => {
    await expect(
      strategy.validate({ sub: '', username: 'x', papel: 'GESTOR' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('403 para o token do cliente: mesmo segredo, mas não é operador', async () => {
    await expect(
      strategy.validate({
        sub: 'cli-1',
        username: undefined as unknown as string,
        papel: 'CLIENTE' as Papel,
      }),
    ).rejects.toBeInstanceOf(ErroNaoAutorizado);
  });

  it('exige JWT_SECRET configurado', () => {
    const semSegredo = { get: () => undefined } as unknown as ConfigService;
    expect(() => new JwtStrategy(semSegredo)).toThrow('JWT_SECRET');
  });
});
