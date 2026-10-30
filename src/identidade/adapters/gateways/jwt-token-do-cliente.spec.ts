import { JwtService } from '@nestjs/jwt';
import { JwtTokenDoCliente } from './jwt-token-do-cliente';

/** Usa o JwtService de verdade: o contrato é o formato do token da Lambda. */
describe('JwtTokenDoCliente', () => {
  const jwt = new JwtService({ secret: 'segredo-teste' });
  const tokens = new JwtTokenDoCliente(jwt);

  it('aceita o token da Lambda { sub: clienteId, papel: CLIENTE }', async () => {
    const token = await jwt.signAsync({ sub: 'cli-1', papel: 'CLIENTE' });
    await expect(tokens.verificar(token)).resolves.toEqual({
      clienteId: 'cli-1',
    });
  });

  it('recusa token de operador (papel GESTOR)', async () => {
    const token = await jwt.signAsync({
      sub: 'u-1',
      username: 'gestor',
      papel: 'GESTOR',
    });
    await expect(tokens.verificar(token)).resolves.toBeNull();
  });

  it('recusa token assinado com outro segredo', async () => {
    const outro = new JwtService({ secret: 'outro-segredo' });
    const token = await outro.signAsync({ sub: 'cli-1', papel: 'CLIENTE' });
    await expect(tokens.verificar(token)).resolves.toBeNull();
  });

  it('recusa token com outro algoritmo, mesmo com o segredo certo', async () => {
    const token = await jwt.signAsync(
      { sub: 'cli-1', papel: 'CLIENTE' },
      { algorithm: 'HS512' },
    );
    await expect(tokens.verificar(token)).resolves.toBeNull();
  });

  it('recusa token expirado', async () => {
    const token = await jwt.signAsync(
      { sub: 'cli-1', papel: 'CLIENTE' },
      { expiresIn: -10 },
    );
    await expect(tokens.verificar(token)).resolves.toBeNull();
  });
});
