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
import { ClienteUseCases } from '../../use-cases/cliente.usecases';
import { apresentarCliente } from '../presenters/cliente.presenter';
import {
  AtualizarClienteDto,
  ClienteRespostaDto,
  CriarClienteDto,
} from '../dtos';

@ApiTags('Clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClienteUseCases) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra um cliente (valida CPF/CNPJ, único)' })
  async criar(@Body() dto: CriarClienteDto): Promise<ClienteRespostaDto> {
    return apresentarCliente(await this.clientes.cadastrar(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os clientes' })
  async listar(): Promise<ClienteRespostaDto[]> {
    return (await this.clientes.listar()).map(apresentarCliente);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um cliente' })
  async porId(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClienteRespostaDto> {
    return apresentarCliente(await this.clientes.buscar(id));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza dados de contato do cliente' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarClienteDto,
  ): Promise<ClienteRespostaDto> {
    return apresentarCliente(await this.clientes.atualizar({ id, ...dto }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove o cliente (soft delete)' })
  async remover(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.clientes.remover(id);
  }
}
