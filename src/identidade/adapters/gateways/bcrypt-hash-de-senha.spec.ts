import { BcryptHashDeSenha } from './bcrypt-hash-de-senha';

/** Usa o bcrypt de verdade: o que importa é o resultado da comparação. */
describe('BcryptHashDeSenha', () => {
  const hash = new BcryptHashDeSenha();

  it('confere a senha com o hash gerado', async () => {
    const gerado = await hash.gerar('s3nha');
    await expect(hash.comparar('s3nha', gerado)).resolves.toBe(true);
    await expect(hash.comparar('errada', gerado)).resolves.toBe(false);
  });

  it('sem hash (usuário inexistente) compara mesmo assim e devolve false', async () => {
    await expect(hash.comparar('qualquer', null)).resolves.toBe(false);
  });
});
