import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErroValidacao } from '../../../compartilhado/erros/erros-dominio';
import { JwtAuthGuard } from '../../../identidade/adapters/guards/jwt-auth.guard';
import { Papeis } from '../../../identidade/adapters/decorators/papeis.decorator';
import { PapeisGuard } from '../../../identidade/adapters/guards/papeis.guard';
import { UsuarioAtual } from '../../../identidade/adapters/decorators/usuario-atual.decorator';
import { UsuarioAutenticado } from '../../../identidade/adapters/guards/jwt.strategy';
import { AbrirOrdemServico } from '../../use-cases/abrir-ordem-servico.usecase';
import { AlterarStatusDaOrdem } from '../../use-cases/alterar-status.usecase';
import { ConcluirExecucao } from '../../use-cases/concluir-execucao.usecase';
import { ConsultarOrdemServico } from '../../use-cases/consultar-ordem-servico.usecase';
import {
  ConfirmarPagamento,
  EntregarVeiculo,
} from '../../use-cases/entrega.usecases';
import { IniciarDiagnostico } from '../../use-cases/iniciar-diagnostico.usecase';
import { LancarOrcamentoAdicional } from '../../use-cases/lancar-orcamento-adicional.usecase';
import { RegistrarDiagnostico } from '../../use-cases/registrar-diagnostico.usecase';
import {
  apresentarDiagnostico,
  apresentarOrdemServico,
} from '../presenters/ordem-servico.presenter';
import {
  AbrirOrdemServicoDto,
  AlterarStatusDto,
  DiagnosticoRespostaDto,
  FiltrarOrdensServicoDto,
  LancarOrcamentoAdicionalDto,
  OrdemServicoRespostaDto,
  PagamentoDto,
  RegistrarDiagnosticoDto,
} from '../dtos';

@ApiTags('Ordens de Serviço')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PapeisGuard)
@Controller('ordens-servico')
export class OrdensServicoController {
  constructor(
    private readonly abrirOrdemServico: AbrirOrdemServico,
    private readonly alterarStatus: AlterarStatusDaOrdem,
    private readonly iniciarDiagnostico: IniciarDiagnostico,
    private readonly registrarDiagnostico: RegistrarDiagnostico,
    private readonly concluirExecucao: ConcluirExecucao,
    private readonly lancarOrcamentoAdicional: LancarOrcamentoAdicional,
    private readonly confirmarPagamento: ConfirmarPagamento,
    private readonly entregarVeiculo: EntregarVeiculo,
    private readonly consulta: ConsultarOrdemServico,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Abre uma OS (status → Recebida)' })
  async abrir(
    @Body() dto: AbrirOrdemServicoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<OrdemServicoRespostaDto> {
    const ordem = await this.abrirOrdemServico.executar({
      ...dto,
      por: usuario.username,
    });
    return apresentarOrdemServico(ordem);
  }

  @Get()
  @ApiOperation({ summary: 'Lista/filtra ordens de serviço' })
  async listar(
    @Query() filtro: FiltrarOrdensServicoDto,
  ): Promise<OrdemServicoRespostaDto[]> {
    const ordens = await this.consulta.listar(filtro);
    return ordens.map(apresentarOrdemServico);
  }

  @Get('fila')
  @ApiOperation({
    summary:
      'Fila de trabalho: OS ativas ordenadas por prioridade de status ' +
      '(Em execução > Aguardando aprovação > Em diagnóstico > Recebida) e, ' +
      'dentro de cada status, as mais antigas primeiro. Exclui (logicamente) ' +
      'as finalizadas, entregues e canceladas.',
  })
  async fila(): Promise<OrdemServicoRespostaDto[]> {
    const ordens = await this.consulta.listarFila();
    return ordens.map(apresentarOrdemServico);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe completo da OS' })
  async porId(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrdemServicoRespostaDto> {
    return apresentarOrdemServico(await this.consulta.buscar(id));
  }

  @Patch(':id/status')
  @Papeis('GESTOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Corrige manualmente o status da OS (GESTOR apenas). Só transições ' +
      'válidas na máquina de estados; não refaz os efeitos das rotas de ' +
      'negócio (reserva, baixa de peça, tempo de execução).',
  })
  @ApiForbiddenResponse({ description: 'Apenas GESTOR pode corrigir o status' })
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AlterarStatusDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<OrdemServicoRespostaDto> {
    const ordem = await this.alterarStatus.executar({
      ordemId: id,
      status: dto.status,
      por: usuario.username,
    });
    return apresentarOrdemServico(ordem);
  }

  @Post(':id/diagnostico/iniciar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Inicia o diagnóstico — o mecânico assume a OS antes de registrar itens (status → Em diagnóstico)',
  })
  async iniciar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<OrdemServicoRespostaDto> {
    const ordem = await this.iniciarDiagnostico.executar({
      ordemId: id,
      por: usuario.username,
    });
    return apresentarOrdemServico(ordem);
  }

  @Post(':id/diagnostico')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Registra serviços/peças e conclui o diagnóstico (verifica estoque, cota faltantes, gera e envia o orçamento; status → Aguardando aprovação)',
  })
  async diagnostico(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarDiagnosticoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<DiagnosticoRespostaDto> {
    const ordem = await this.registrarDiagnostico.executar({
      ordemId: id,
      servicos: dto.servicos,
      pecas: dto.pecas ?? [],
      por: usuario.username,
    });
    return apresentarDiagnostico(ordem);
  }

  @Post(':id/execucao/concluir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Conclui a execução (baixa peças reservadas, registra tempo; → Finalizada)',
  })
  async concluir(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<OrdemServicoRespostaDto> {
    const ordem = await this.concluirExecucao.executar({
      ordemId: id,
      por: usuario.username,
    });
    return apresentarOrdemServico(ordem);
  }

  @Post(':id/orcamentos-adicionais')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Lança um orçamento adicional durante a execução (envia ao cliente para autorizar)',
  })
  async lancarOrcamentoAdicionalEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LancarOrcamentoAdicionalDto,
  ): Promise<OrdemServicoRespostaDto> {
    const ordem = await this.lancarOrcamentoAdicional.executar({
      ordemId: id,
      descricao: dto.descricao,
      servicos: dto.servicos ?? [],
      pecas: dto.pecas ?? [],
    });
    return apresentarOrdemServico(ordem);
  }

  @Post(':id/pagamento')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirma o pagamento (manual); libera a entrega' })
  async pagamento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PagamentoDto,
  ): Promise<OrdemServicoRespostaDto> {
    if (!dto.pago) {
      throw new ErroValidacao('Envie { "pago": true } para confirmar.');
    }
    const ordem = await this.confirmarPagamento.executar({ ordemId: id });
    return apresentarOrdemServico(ordem);
  }

  @Post(':id/entrega')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Entrega o veículo e encerra a OS (exige pagamento confirmado)',
  })
  async entrega(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<OrdemServicoRespostaDto> {
    const ordem = await this.entregarVeiculo.executar({
      ordemId: id,
      por: usuario.username,
    });
    return apresentarOrdemServico(ordem);
  }
}
