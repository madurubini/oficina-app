import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { SituacaoPecaOrcada } from '../entities/itens';
import { StatusOS } from '../entities/status-os';

export class AbrirOrdemServicoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clienteId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  veiculoId!: string;

  @ApiProperty({
    example: 'Barulho na suspensão dianteira ao passar em buracos.',
  })
  @IsString()
  @IsNotEmpty()
  problemaRelatado!: string;
}

class HistoricoItemDto {
  @ApiProperty() status!: string;
  @ApiProperty() em!: Date;
  @ApiProperty({ nullable: true }) por!: string | null;
}

class ServicoOrcadoDto {
  @ApiProperty() servicoId!: string;
  @ApiProperty() descricao!: string;
  @ApiProperty() quantidade!: number;
  @ApiProperty() precoAplicado!: number;
}

class PecaOrcadaDto {
  @ApiProperty() pecaId!: string;
  @ApiProperty() descricao!: string;
  @ApiProperty() quantidade!: number;
  @ApiProperty() precoAplicado!: number;
  @ApiProperty({ enum: SituacaoPecaOrcada }) situacao!: SituacaoPecaOrcada;
}

export class OrcamentoDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'INICIAL' }) tipo!: string;
  @ApiProperty({ nullable: true }) descricao!: string | null;
  @ApiProperty() totalServicos!: number;
  @ApiProperty() totalPecas!: number;
  @ApiProperty() total!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [ServicoOrcadoDto] }) servicos!: ServicoOrcadoDto[];
  @ApiProperty({ type: [PecaOrcadaDto] }) pecas!: PecaOrcadaDto[];
}

export class OrdemServicoRespostaDto {
  @ApiProperty() id!: string;
  @ApiProperty() numero!: string;
  @ApiProperty() clienteId!: string;
  @ApiProperty() veiculoId!: string;
  @ApiProperty() problemaRelatado!: string;
  @ApiProperty({ example: 'Recebida' }) status!: string;
  @ApiProperty() versao!: number;
  @ApiProperty() pago!: boolean;
  @ApiProperty({ nullable: true }) pagoEm!: Date | null;
  @ApiProperty() criadoEm!: Date;
  @ApiProperty({
    type: [ServicoOrcadoDto],
    description:
      'Serviços da OS, consolidados dos orçamentos não recusados. Vazio na abertura; o diagnóstico preenche.',
  })
  servicos!: ServicoOrcadoDto[];
  @ApiProperty({
    type: [PecaOrcadaDto],
    description:
      'Peças da OS, consolidadas dos orçamentos não recusados. Vazio na abertura; o diagnóstico preenche.',
  })
  pecas!: PecaOrcadaDto[];
  @ApiProperty({ type: [HistoricoItemDto] }) historico!: HistoricoItemDto[];
  @ApiProperty({ type: [OrcamentoDto] }) orcamentos!: OrcamentoDto[];
}

class ItemServicoEntradaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  servicoId!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantidade!: number;
}

class ItemPecaEntradaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pecaId!: string;

  @ApiProperty({ example: 4, minimum: 1 })
  @IsInt()
  @Min(1)
  quantidade!: number;
}

export class RegistrarDiagnosticoDto {
  @ApiProperty({ type: [ItemServicoEntradaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemServicoEntradaDto)
  servicos!: ItemServicoEntradaDto[];

  @ApiProperty({ type: [ItemPecaEntradaDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemPecaEntradaDto)
  pecas?: ItemPecaEntradaDto[];
}

class PendenciaEstoqueDto {
  @ApiProperty() pecaId!: string;
  @ApiProperty({ enum: SituacaoPecaOrcada }) situacao!: SituacaoPecaOrcada;
}

export class AcompanhamentoRespostaDto {
  @ApiProperty({
    description: 'Id da OS, usado nas demais rotas de acompanhamento',
  })
  id!: string;
  @ApiProperty() numero!: string;
  @ApiProperty() problemaRelatado!: string;
  @ApiProperty() status!: string;
  @ApiProperty() pago!: boolean;
  @ApiProperty({ type: [OrcamentoDto] }) orcamentos!: OrcamentoDto[];
  @ApiProperty({ type: [HistoricoItemDto] }) historico!: HistoricoItemDto[];
}

export class RespostaOrcamentoDto {
  @ApiProperty({ description: 'true aprova, false recusa o orçamento' })
  @IsBoolean()
  aprovado!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  justificativa?: string;
}

export class LancarOrcamentoAdicionalDto {
  @ApiProperty({ example: 'Troca da correia dentada (desgaste detectado)' })
  @IsString()
  @IsNotEmpty()
  descricao!: string;

  @ApiProperty({ type: [ItemServicoEntradaDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemServicoEntradaDto)
  servicos?: ItemServicoEntradaDto[];

  @ApiProperty({ type: [ItemPecaEntradaDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemPecaEntradaDto)
  pecas?: ItemPecaEntradaDto[];
}

export class PagamentoDto {
  @ApiProperty({ example: true, description: 'Confirma o pagamento manual' })
  @IsBoolean()
  pago!: boolean;
}

/**
 * Correção manual do status pelo gestor. O status vem no vocabulário interno
 * (`EM_EXECUCAO`), o mesmo do filtro da listagem — o rótulo legível
 * ("Em execução") é coisa da resposta, não da entrada.
 */
export class AlterarStatusDto {
  @ApiProperty({
    enum: StatusOS,
    example: StatusOS.CANCELADA,
    description:
      'Novo status. Precisa ser uma transição válida a partir do status atual da OS (senão 422).',
  })
  @IsEnum(StatusOS)
  status!: StatusOS;
}

export class DiagnosticoRespostaDto {
  @ApiProperty({ example: 'Aguardando aprovação' }) status!: string;
  @ApiProperty({ type: OrcamentoDto }) orcamento!: OrcamentoDto;
  @ApiProperty({ type: [PendenciaEstoqueDto] })
  pendenciasEstoque!: PendenciaEstoqueDto[];
}

/**
 * Filtros da listagem de OS. Validados como DTO para que um status inexistente
 * ou um id malformado virem 400 aqui, em vez de descerem até o banco.
 */
export class FiltrarOrdensServicoDto {
  @ApiPropertyOptional({ enum: StatusOS })
  @IsOptional()
  @IsEnum(StatusOS)
  status?: StatusOS;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clienteId?: string;
}

export class PeriodoRelatorioDto {
  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Início do período (ISO-8601)',
  })
  @IsOptional()
  @IsISO8601()
  inicio?: string;

  @ApiPropertyOptional({
    example: '2026-01-31',
    description: 'Fim do período (ISO-8601)',
  })
  @IsOptional()
  @IsISO8601()
  fim?: string;
}
