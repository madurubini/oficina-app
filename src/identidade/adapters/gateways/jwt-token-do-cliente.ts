import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  PAPEL_CLIENTE,
  TokenDoCliente,
} from '../../use-cases/token-do-cliente';

interface PayloadCliente {
  sub: string;
  papel: string;
}

/**
 * Confere assinatura, validade e papel. O papel impede que um token de
 * operador seja aceito como de cliente — o inverso é barrado no JwtStrategy.
 */
@Injectable()
export class JwtTokenDoCliente implements TokenDoCliente {
  constructor(private readonly jwt: JwtService) {}

  async verificar(token: string): Promise<{ clienteId: string } | null> {
    try {
      const payload = await this.jwt.verifyAsync<PayloadCliente>(token);
      if (payload?.papel !== PAPEL_CLIENTE || typeof payload.sub !== 'string') {
        return null;
      }
      return { clienteId: payload.sub };
    } catch {
      return null;
    }
  }
}
