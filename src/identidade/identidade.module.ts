import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { AutenticarUsuario } from './use-cases/autenticar-usuario.usecase';
import { CadastrarUsuario } from './use-cases/cadastrar-usuario.usecase';
import { USUARIO_REPOSITORY } from './use-cases/usuario.repositorio';
import { HASH_DE_SENHA } from './use-cases/hash-de-senha';
import { GERADOR_DE_TOKEN } from './use-cases/gerador-de-token';
import { TOKEN_DO_CLIENTE } from './use-cases/token-do-cliente';
import { BcryptHashDeSenha } from './adapters/gateways/bcrypt-hash-de-senha';
import { JwtGeradorDeToken } from './adapters/gateways/jwt-gerador-de-token';
import { JwtTokenDoCliente } from './adapters/gateways/jwt-token-do-cliente';
import { PrismaUsuarioRepository } from './adapters/gateways/prisma-usuario.repositorio';
import { JwtStrategy } from './adapters/guards/jwt.strategy';
import { PapeisGuard } from './adapters/guards/papeis.guard';
import { ClienteGuard } from './adapters/guards/cliente.guard';
import { AuthController } from './adapters/controllers/auth.controller';
import { UsuariosController } from './adapters/controllers/usuarios.controller';

/**
 * Contexto Identidade e Acesso (transversal às rotas protegidas).
 * Liga as portas do domínio às implementações de infraestrutura e expõe o
 * JwtStrategy/JwtAuthGuard (operadores) e o ClienteGuard (cliente logado por
 * CPF) para os demais módulos protegerem suas rotas.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_EXPIRES_IN',
            '3600s',
          ) as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController, UsuariosController],
  providers: [
    AutenticarUsuario,
    CadastrarUsuario,
    JwtStrategy,
    PapeisGuard,
    ClienteGuard,
    { provide: USUARIO_REPOSITORY, useClass: PrismaUsuarioRepository },
    { provide: HASH_DE_SENHA, useClass: BcryptHashDeSenha },
    { provide: GERADOR_DE_TOKEN, useClass: JwtGeradorDeToken },
    { provide: TOKEN_DO_CLIENTE, useClass: JwtTokenDoCliente },
  ],
  exports: [JwtModule, PassportModule, TOKEN_DO_CLIENTE, ClienteGuard],
})
export class IdentidadeModule {}
