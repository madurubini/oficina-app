import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClienteAtual } from '../../../identidade/adapters/decorators/cliente-atual.decorator';
import {
  ClienteAutenticado,
  ClienteGuard,
} from '../../../identidade/adapters/guards/cliente.guard';
import { AprovarOrcamento } from '../../use-cases/aprovar-orcamento.usecase';
import { ConsultarOrdemServico } from '../../use-cases/consultar-ordem-servico.usecase';
import { RecusarOrcamento } from '../../use-cases/recusar-orcamento.usecase';
import { apresentarAcompanhamento } from '../presenters/ordem-servico.presenter';
import { AcompanhamentoRespostaDto, RespostaOrcamentoDto } from '../dtos';

/**
 * Acompanhamento do cliente (app). Todas as rotas exigem o TOKEN DO CLIENTE,
 * emitido pelo login por CPF (Lambda `auth-cpf`). O cliente só enxerga e
 * responde as próprias OSs: a posse é conferida no caso de uso, então o token
 * de um cliente não abre a OS de outro (403).
 */
@ApiTags('Acompanhamento do cliente')
@ApiBearerAuth()
@UseGuards(ClienteGuard)
@Controller('acompanhamento')
export class AcompanhamentoController {
  constructor(
    private readonly aprovarOrcamento: AprovarOrcamento,
    private readonly recusarOrcamento: RecusarOrcamento,
    private readonly consulta: ConsultarOrdemServico,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista as OSs do cliente logado' })
  async listar(
    @ClienteAtual() cliente: ClienteAutenticado,
  ): Promise<AcompanhamentoRespostaDto[]> {
    const ordens = await this.consulta.listarDoCliente(cliente.id);
    return ordens.map(apresentarAcompanhamento);
  }

  @Get(':osId')
  @ApiOperation({
    summary: 'Status, orçamentos e histórico de uma OS do cliente',
  })
  async consultar(
    @Param('osId', ParseUUIDPipe) osId: string,
    @ClienteAtual() cliente: ClienteAutenticado,
  ): Promise<AcompanhamentoRespostaDto> {
    return apresentarAcompanhamento(
      await this.consulta.buscarDoCliente(osId, cliente.id),
    );
  }

  @Post(':osId/orcamentos/:orcamentoId/resposta')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cliente aprova ou recusa um orçamento da própria OS (roteia para dois casos de uso)',
  })
  async responder(
    @Param('osId', ParseUUIDPipe) osId: string,
    @Param('orcamentoId', ParseUUIDPipe) orcamentoId: string,
    @Body() dto: RespostaOrcamentoDto,
    @ClienteAtual() cliente: ClienteAutenticado,
  ): Promise<AcompanhamentoRespostaDto> {
    // Confere a posse antes de mexer na OS.
    await this.consulta.buscarDoCliente(osId, cliente.id);
    const ordem = dto.aprovado
      ? await this.aprovarOrcamento.executar({
          ordemId: osId,
          orcamentoId,
          por: 'cliente',
        })
      : await this.recusarOrcamento.executar({
          ordemId: osId,
          orcamentoId,
          justificativa: dto.justificativa,
          por: 'cliente',
        });
    return apresentarAcompanhamento(ordem);
  }
}
