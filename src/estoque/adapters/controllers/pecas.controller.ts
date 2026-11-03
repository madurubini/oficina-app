import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../identidade/adapters/guards/jwt-auth.guard';
import { PecaUseCases } from '../../use-cases/peca.usecases';
import { apresentarPeca } from '../presenters/peca.presenter';
import {
  AjusteEstoqueDto,
  AtualizarPecaDto,
  CriarPecaDto,
  PecaRespostaDto,
} from '../dtos';

@ApiTags('Peças e estoque')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pecas')
export class PecasController {
  constructor(private readonly pecas: PecaUseCases) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra uma peça (código único)' })
  async criar(@Body() dto: CriarPecaDto): Promise<PecaRespostaDto> {
    return apresentarPeca(await this.pecas.cadastrar(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista as peças ativas' })
  async listar(): Promise<PecaRespostaDto[]> {
    return (await this.pecas.listar()).map(apresentarPeca);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha uma peça' })
  async porId(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PecaRespostaDto> {
    return apresentarPeca(await this.pecas.buscar(id));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza nome/preço da peça' })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarPecaDto,
  ): Promise<PecaRespostaDto> {
    return apresentarPeca(await this.pecas.atualizar({ id, ...dto }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove uma peça (soft delete)' })
  async excluir(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.pecas.remover(id);
  }

  @Patch(':id/estoque')
  @ApiOperation({ summary: 'Ajuste manual de saldo (entrada/saída)' })
  async ajustarEstoque(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AjusteEstoqueDto,
  ): Promise<PecaRespostaDto> {
    return apresentarPeca(await this.pecas.ajustarEstoque({ id, ...dto }));
  }
}
