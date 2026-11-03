import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { HashDeSenha } from '../../use-cases/hash-de-senha';

@Injectable()
export class BcryptHashDeSenha implements HashDeSenha {
  private readonly custo = 10;
  // Hash de uma senha aleatória, com o mesmo custo: só serve para gastar o
  // mesmo tempo quando o usuário não existe.
  private readonly hashDeReferencia = bcrypt.hashSync(
    randomBytes(16).toString('hex'),
    this.custo,
  );

  async comparar(senhaPlana: string, hash: string | null): Promise<boolean> {
    const confere = await bcrypt.compare(
      senhaPlana,
      hash ?? this.hashDeReferencia,
    );
    return hash !== null && confere;
  }

  gerar(senhaPlana: string): Promise<string> {
    return bcrypt.hash(senhaPlana, this.custo);
  }
}
