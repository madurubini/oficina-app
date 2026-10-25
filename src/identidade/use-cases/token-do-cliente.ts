export const TOKEN_DO_CLIENTE = Symbol('TokenDoCliente');

/** Papel gravado no token do cliente; não é um papel de operador (`Papel`). */
export const PAPEL_CLIENTE = 'CLIENTE';

/**
 * Token do cliente: emitido pela Lambda `auth-cpf` (repo oficina-lambda-auth)
 * depois de conferir o CPF, com `{ sub: clienteId, papel: 'CLIENTE' }`, e
 * assinado com o mesmo JWT_SECRET da aplicação. Aqui ele só é verificado: a
 * aplicação não emite token de cliente.
 */
export interface TokenDoCliente {
  /** Valida o token; devolve o clienteId, ou null se inválido/expirado/não for de cliente. */
  verificar(token: string): Promise<{ clienteId: string } | null>;
}
