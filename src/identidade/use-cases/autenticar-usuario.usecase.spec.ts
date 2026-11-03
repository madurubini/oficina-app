import { ErroNaoAutenticado } from '../../compartilhado/erros/erros-dominio';
import { Usuario } from '../entities/usuario';
import { GeradorDeToken } from './gerador-de-token';
import { HashDeSenha } from './hash-de-senha';
import { UsuarioRepository } from './usuario.repositorio';
import { AutenticarUsuario } from './autenticar-usuario.usecase';

describe('AutenticarUsuario', () => {
  const usuarioAtivo: Usuario = {
    id: 'uuid-1',
    username: 'gestor',
    senhaHash: 'hash',
    papel: 'GESTOR',
    ativo: true,
  };

  let repo: jest.Mocked<UsuarioRepository>;
  let hash: jest.Mocked<HashDeSenha>;
  let token: jest.Mocked<GeradorDeToken>;
  let usecase: AutenticarUsuario;

  beforeEach(() => {
    repo = { buscarPorUsername: jest.fn(), inserir: jest.fn() };
    hash = { comparar: jest.fn(), gerar: jest.fn() };
    token = {
      gerar: jest
        .fn()
        .mockResolvedValue({ accessToken: 'jwt-token', expiresIn: 3600 }),
    };
    usecase = new AutenticarUsuario(repo, hash, token);
  });

  it('emite o token quando as credenciais são válidas', async () => {
    repo.buscarPorUsername.mockResolvedValue(usuarioAtivo);
    hash.comparar.mockResolvedValue(true);

    const resultado = await usecase.executar({
      username: 'gestor',
      senha: 'gestor123',
    });

    expect(resultado).toEqual({ accessToken: 'jwt-token', expiresIn: 3600 });
    expect(token.gerar).toHaveBeenCalledWith({
      sub: 'uuid-1',
      username: 'gestor',
      papel: 'GESTOR',
    });
  });

  it('rejeita quando o usuário não existe', async () => {
    repo.buscarPorUsername.mockResolvedValue(null);

    await expect(
      usecase.executar({ username: 'fantasma', senha: 'x' }),
    ).rejects.toBeInstanceOf(ErroNaoAutenticado);
    // Compara mesmo assim (sem hash): mesmo tempo de resposta.
    expect(hash.comparar).toHaveBeenCalledWith('x', null);
    expect(token.gerar).not.toHaveBeenCalled();
  });

  it('rejeita quando o usuário está inativo (soft delete)', async () => {
    repo.buscarPorUsername.mockResolvedValue({
      ...usuarioAtivo,
      ativo: false,
    });

    await expect(
      usecase.executar({ username: 'gestor', senha: 'gestor123' }),
    ).rejects.toBeInstanceOf(ErroNaoAutenticado);
    expect(token.gerar).not.toHaveBeenCalled();
  });

  it('rejeita quando a senha não confere', async () => {
    repo.buscarPorUsername.mockResolvedValue(usuarioAtivo);
    hash.comparar.mockResolvedValue(false);

    await expect(
      usecase.executar({ username: 'gestor', senha: 'errada' }),
    ).rejects.toBeInstanceOf(ErroNaoAutenticado);
    expect(token.gerar).not.toHaveBeenCalled();
  });
});
