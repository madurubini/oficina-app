export const HASH_DE_SENHA = Symbol('HashDeSenha');

export interface HashDeSenha {
  /**
   * Sem `hash` (usuário inexistente), compara mesmo assim contra um hash fixo
   * e devolve false: a resposta leva o mesmo tempo, exista o usuário ou não.
   */
  comparar(senhaPlana: string, hash: string | null): Promise<boolean>;
  gerar(senhaPlana: string): Promise<string>;
}
