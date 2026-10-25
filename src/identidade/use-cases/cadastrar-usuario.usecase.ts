import { Inject, Injectable } from '@nestjs/common';
import {
  GERADOR_DE_ID,
  GeradorDeId,
} from '../../compartilhado/dominio/gerador-de-id';
import {
  ErroConflito,
  ErroValidacao,
} from '../../compartilhado/erros/erros-dominio';
import { PAPEIS, Papel, Usuario } from '../entities/usuario';
import { HASH_DE_SENHA, HashDeSenha } from './hash-de-senha';
import { USUARIO_REPOSITORY, UsuarioRepository } from './usuario.repositorio';

export interface EntradaCadastrarUsuario {
  username: string;
  senha: string;
  papel: Papel;
}

export interface UsuarioCriado {
  id: string;
  username: string;
  papel: Papel;
  ativo: boolean;
}

/**
 * Caso de uso: cadastrar um usuário administrativo. Restrito ao GESTOR (o papel
 * é checado no guard da rota). Valida os dados, garante username único e grava
 * apenas o HASH da senha — nunca o texto plano.
 */
@Injectable()
export class CadastrarUsuario {
  constructor(
    @Inject(USUARIO_REPOSITORY)
    private readonly usuarios: UsuarioRepository,
    @Inject(HASH_DE_SENHA)
    private readonly hash: HashDeSenha,
    @Inject(GERADOR_DE_ID)
    private readonly ids: GeradorDeId,
  ) {}

  async executar(entrada: EntradaCadastrarUsuario): Promise<UsuarioCriado> {
    const username = entrada.username?.trim();
    if (!username) {
      throw new ErroValidacao('username é obrigatório.');
    }
    if (!entrada.senha || entrada.senha.length < 6) {
      throw new ErroValidacao('A senha deve ter ao menos 6 caracteres.');
    }
    if (!PAPEIS.includes(entrada.papel)) {
      throw new ErroValidacao('Papel inválido.', {
        papeisValidos: PAPEIS,
      });
    }

    const existente = await this.usuarios.buscarPorUsername(username);
    if (existente) {
      throw new ErroConflito('Já existe um usuário com esse username.', {
        username,
      });
    }

    const usuario: Usuario = {
      id: this.ids.novo(),
      username,
      senhaHash: await this.hash.gerar(entrada.senha),
      papel: entrada.papel,
      ativo: true,
    };
    await this.usuarios.inserir(usuario);

    return {
      id: usuario.id,
      username: usuario.username,
      papel: usuario.papel,
      ativo: usuario.ativo,
    };
  }
}
