import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../identidade/adapters/guards/jwt-auth.guard';
import { ServicoUseCases } from '../../use-cases/servico.usecases';
import { apresentarServico } from '../presenters/servico.presenter';
import {
  AtualizarServicoDto,
  CriarServicoDto,
  ServicoRespostaDto,
} from '../dtos';

@ApiTags('Serviços (catálogo)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('servicos')
export class ServicosController {
  constructor(private readonly servicos: ServicoUseCases) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra um serviço' })
  async criar(@Body() dto: CriarServicoDto): Promise<ServicoRespostaDto> {
    return apresentarServico(await this.servicos.cadastrar(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os serviços ativos' })
  async listar(): Promise<ServicoRespostaDto[]> {
    return (await this.servicos.listar()).map(apresentarServico);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um serviço' })
  async porId(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServicoRespostaDto> {
    return apresentarServico(await this.servicos.buscar(id));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza um serviço' })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarServicoDto,
  ): Promise<ServicoRespostaDto> {
    return apresentarServico(await this.servicos.atualizar({ id, ...dto }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um serviço (soft delete)' })
  async excluir(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.servicos.remover(id);
  }
}
