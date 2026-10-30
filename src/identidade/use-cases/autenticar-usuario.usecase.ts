import { Inject, Injectable } from '@nestjs/common';
import { ErroNaoAutenticado } from '../../compartilhado/erros/erros-dominio';
import {
  GERADOR_DE_TOKEN,
  GeradorDeToken,
  TokenGerado,
} from './gerador-de-token';
import { HASH_DE_SENHA, HashDeSenha } from './hash-de-senha';
import { USUARIO_REPOSITORY, UsuarioRepository } from './usuario.repositorio';

export interface EntradaAutenticarUsuario {
  username: string;
  senha: string;
}

/**
 * Caso de uso: autenticar um usuário administrativo (CMD "Autenticar").
 * Valida as credenciais e, em caso de sucesso, emite o token JWT.
 * Mensagem genérica em qualquer falha para não revelar se o usuário existe.
 */
@Injectable()
export class AutenticarUsuario {
  constructor(
    @Inject(USUARIO_REPOSITORY)
    private readonly usuarios: UsuarioRepository,
    @Inject(HASH_DE_SENHA)
    private readonly hash: HashDeSenha,
    @Inject(GERADOR_DE_TOKEN)
    private readonly token: GeradorDeToken,
  ) {}

  async executar(entrada: EntradaAutenticarUsuario): Promise<TokenGerado> {
    const usuario = await this.usuarios.buscarPorUsername(entrada.username);

    // A senha é comparada sempre, mesmo sem usuário: assim o tempo de resposta
    // não revela quais usernames existem.
    const senhaConfere = await this.hash.comparar(
      entrada.senha,
      usuario?.senhaHash ?? null,
    );
    if (!usuario || !usuario.ativo || !senhaConfere) {
      throw new ErroNaoAutenticado('Credenciais inválidas.');
    }

    return this.token.gerar({
      sub: usuario.id,
      username: usuario.username,
      papel: usuario.papel,
    });
  }
}
