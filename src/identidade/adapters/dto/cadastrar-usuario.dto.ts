import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { PAPEIS, Papel } from '../../entities/usuario';

export class CadastrarUsuarioDto {
  @ApiProperty({ example: 'recepcao01' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'senhaForte123', minLength: 6 })
  @IsString()
  @MinLength(6)
  senha!: string;

  @ApiProperty({ enum: PAPEIS, example: 'RECEPCIONISTA' })
  @IsIn(PAPEIS)
  papel!: Papel;
}

export class UsuarioCriadoDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ enum: PAPEIS }) papel!: Papel;
  @ApiProperty() ativo!: boolean;
}
