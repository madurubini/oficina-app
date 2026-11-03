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
import { VeiculoUseCases } from '../../use-cases/veiculo.usecases';
import { apresentarVeiculo } from '../presenters/veiculo.presenter';
import {
  AtualizarVeiculoDto,
  CriarVeiculoDto,
  VeiculoRespostaDto,
} from '../dtos';

@ApiTags('Veículos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class VeiculosController {
  constructor(private readonly veiculos: VeiculoUseCases) {}

  @Post('clientes/:clienteId/veiculos')
  @ApiOperation({ summary: 'Cadastra um veículo para o cliente (placa única)' })
  async criar(
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body() dto: CriarVeiculoDto,
  ): Promise<VeiculoRespostaDto> {
    return apresentarVeiculo(
      await this.veiculos.cadastrar({ clienteId, ...dto }),
    );
  }

  @Get('clientes/:clienteId/veiculos')
  @ApiOperation({ summary: 'Lista os veículos de um cliente' })
  async listarDoCliente(
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
  ): Promise<VeiculoRespostaDto[]> {
    return (await this.veiculos.listarDoCliente(clienteId)).map(
      apresentarVeiculo,
    );
  }

  @Get('veiculos/:id')
  @ApiOperation({ summary: 'Detalha um veículo' })
  async porId(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VeiculoRespostaDto> {
    return apresentarVeiculo(await this.veiculos.buscar(id));
  }

  @Put('veiculos/:id')
  @ApiOperation({ summary: 'Atualiza marca/modelo/ano do veículo' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarVeiculoDto,
  ): Promise<VeiculoRespostaDto> {
    return apresentarVeiculo(await this.veiculos.atualizar({ id, ...dto }));
  }

  @Delete('veiculos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove o veículo (soft delete)' })
  async remover(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.veiculos.remover(id);
  }
}
