import { ExecutionContext } from '@nestjs/common';
import { ErroNaoAutenticado } from '../../../compartilhado/erros/erros-dominio';
import { TokenDoCliente } from '../../use-cases/token-do-cliente';
import { ClienteAutenticado, ClienteGuard } from './cliente.guard';

type Requisicao = {
  headers?: Record<string, string>;
  cliente?: ClienteAutenticado;
};

function contexto(req: Requisicao): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('ClienteGuard', () => {
  let tokens: jest.Mocked<TokenDoCliente>;
  let guard: ClienteGuard;

  beforeEach(() => {
    tokens = { verificar: jest.fn() };
    guard = new ClienteGuard(tokens);
  });

  it('libera e coloca o cliente na requisição quando o token é válido', async () => {
    tokens.verificar.mockResolvedValue({ clienteId: 'cli-1' });
    const req: Requisicao = { headers: { authorization: 'Bearer tok' } };
    await expect(guard.canActivate(contexto(req))).resolves.toBe(true);
    expect(tokens.verificar).toHaveBeenCalledWith('tok');
    expect(req.cliente).toEqual({ id: 'cli-1' });
  });

  it('401 quando não há token', async () => {
    await expect(guard.canActivate(contexto({}))).rejects.toBeInstanceOf(
      ErroNaoAutenticado,
    );
  });

  it('401 quando o cabeçalho não é Bearer', async () => {
    const ctx = contexto({ headers: { authorization: 'Basic abc' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ErroNaoAutenticado,
    );
  });

  it('401 quando o token é inválido, expirado ou não é de cliente', async () => {
    tokens.verificar.mockResolvedValue(null);
    const ctx = contexto({ headers: { authorization: 'Bearer ruim' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ErroNaoAutenticado,
    );
  });
});
