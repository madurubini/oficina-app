import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ErroNaoAutorizado } from '../../../compartilhado/erros/erros-dominio';
import { PAPEIS, Papel } from '../../entities/usuario';

export interface UsuarioAutenticado {
  id: string;
  username: string;
  papel: Papel;
}

interface PayloadJwt {
  sub: string;
  username: string;
  papel: Papel;
}

/**
 * Valida o Bearer token nas rotas administrativas. O retorno vira
 * `request.user`, acessível via decorator `@UsuarioAtual()`.
 *
 * O token do cliente (login por CPF) é assinado com o mesmo segredo, então a
 * assinatura sozinha não basta: só passa quem tem papel de operador. Sem essa
 * conferência, um cliente logado leria as rotas sem `@Papeis` (ex.: listar
 * clientes).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const segredo = config.get<string>('JWT_SECRET');
    if (!segredo) {
      throw new Error('JWT_SECRET não configurado.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: segredo,
      // Só o algoritmo com que o app assina: impede a troca por outro.
      algorithms: ['HS256'],
    });
  }

  async validate(payload: PayloadJwt): Promise<UsuarioAutenticado> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Token inválido.');
    }
    if (!PAPEIS.includes(payload.papel)) {
      throw new ErroNaoAutorizado(
        'Token de cliente não acessa rotas administrativas.',
      );
    }
    return {
      id: payload.sub,
      username: payload.username,
      papel: payload.papel,
    };
  }
}
