import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execSync } from 'child_process';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FiltroExcecaoGlobal } from '../src/compartilhado/erros/filtro-excecao-global';
import { traduzirErroPrisma } from '../src/compartilhado/infraestrutura/prisma/erros-prisma';
import { PrismaService } from '../src/compartilhado/infraestrutura/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

/**
 * Sobe o AppModule contra um Postgres real e percorre o ciclo por HTTP, sem
 * mocks: abrir → diagnóstico → aprovação → reserva → conclusão → baixa →
 * pagamento → entrega.
 *
 * Exige um banco dedicado (DATABASE_URL_E2E ou um `oficina_e2e` local), que é
 * resetado a cada execução — o banco principal nunca é tocado.
 */
const E2E_DB =
  process.env.DATABASE_URL_E2E ??
  'postgresql://oficina:oficina@localhost:5433/oficina_e2e?schema=public';

// Força TUDO (Prisma e o db push) a usar o banco de teste — protege o principal.
process.env.DATABASE_URL = E2E_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-e2e';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '3600s';

const SERVICO_ID = '11111111-1111-4111-8111-111111111111';
const PECA_ID = '33333333-3333-4333-8333-333333333333';
// Peça sem saldo: força o diagnóstico a cotar (EM_COTACAO) e a OS a Aguardando peça.
const PECA_ESCASSA_ID = '44444444-4444-4444-8444-444444444444';
const CLIENTE_DESCONHECIDO = '00000000-0000-4000-8000-000000000000';

describe('Fluxo da OS (e2e — integração com Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Schema limpo no banco de teste (reset a cada execução).
    execSync('npx prisma db push --force-reset --skip-generate', {
      stdio: 'inherit',
      env: process.env,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // Mesma fiação do main.ts: sem o tradutor, violação de constraint vira 500.
    app.useGlobalFilters(
      new FiltroExcecaoGlobal({ tradutores: [traduzirErroPrisma] }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.usuario.create({
      data: {
        username: 'gestor',
        senhaHash: await bcrypt.hash('gestor123', 10),
        papel: 'GESTOR',
      },
    });
    await prisma.servico.create({
      data: { id: SERVICO_ID, nome: 'Troca de óleo', precoBase: 120 },
    });
    await prisma.peca.create({
      data: {
        id: PECA_ID,
        codigo: 'FILTRO-OLEO',
        nome: 'Filtro de óleo',
        precoUnitario: 35,
        saldoFisico: 10,
      },
    });
    await prisma.peca.create({
      data: {
        id: PECA_ESCASSA_ID,
        codigo: 'BOMBA-DAGUA',
        nome: 'Bomba d’água',
        precoUnitario: 200,
        saldoFisico: 0, // em falta: vira encomenda na aprovação
      },
    });
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  /** O mesmo token que a Lambda auth-cpf emite depois de conferir o CPF. */
  function tokenDoCliente(clienteId: string): Promise<string> {
    return app.get(JwtService).signAsync({ sub: clienteId, papel: 'CLIENTE' });
  }

  it('percorre o ciclo completo da OS e movimenta o estoque', async () => {
    const http = request(app.getHttpServer());
    const base = '/api/v1';

    // 1. Login (operador)
    const login = await http
      .post(`${base}/auth/login`)
      .send({ username: 'gestor', senha: 'gestor123' })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    // 2. Cliente + veículo
    const cli = await http
      .post(`${base}/clientes`)
      .set(auth)
      .send({ documento: '529.982.247-25', nome: 'Maria' })
      .expect(201);
    const veic = await http
      .post(`${base}/clientes/${cli.body.id}/veiculos`)
      .set(auth)
      .send({ placa: 'ABC1D23', marca: 'VW', modelo: 'Gol', ano: 2018 })
      .expect(201);

    // 3. Abrir OS
    const os = await http
      .post(`${base}/ordens-servico`)
      .set(auth)
      .send({
        clienteId: cli.body.id,
        veiculoId: veic.body.id,
        problemaRelatado: 'Barulho na suspensão',
      })
      .expect(201);
    const osId = os.body.id;
    expect(os.body.status).toBe('Recebida');
    // Os arrays existem desde a abertura, vazios — quem preenche é o diagnóstico.
    expect(os.body.servicos).toEqual([]);
    expect(os.body.pecas).toEqual([]);

    // 4. Diagnóstico: o mecânico assume a OS e registra os itens (o orçamento
    // inicial já sai enviado ao cliente na conclusão do diagnóstico).
    await http
      .post(`${base}/ordens-servico/${osId}/diagnostico/iniciar`)
      .set(auth)
      .expect(200);
    const diag = await http
      .post(`${base}/ordens-servico/${osId}/diagnostico`)
      .set(auth)
      .send({
        servicos: [{ servicoId: SERVICO_ID, quantidade: 1 }],
        pecas: [{ pecaId: PECA_ID, quantidade: 2 }],
      })
      .expect(200);
    const orcamentoId = diag.body.orcamento.id;
    expect(diag.body.orcamento.total).toBe(190); // 120 + 2*35

    // Depois do diagnóstico a OS consolida as linhas do orçamento inicial.
    const osComItens = await http
      .get(`${base}/ordens-servico/${osId}`)
      .set(auth)
      .expect(200);
    expect(osComItens.body.servicos).toHaveLength(1);
    expect(osComItens.body.servicos[0].servicoId).toBe(SERVICO_ID);
    expect(osComItens.body.pecas).toHaveLength(1);
    expect(osComItens.body.pecas[0].pecaId).toBe(PECA_ID);

    // 5. Cliente aprova com o token do login por CPF (sem login de operador)
    const tokenCliente = await tokenDoCliente(cli.body.id);
    const aprov = await http
      .post(`${base}/acompanhamento/${osId}/orcamentos/${orcamentoId}/resposta`)
      .set({ Authorization: `Bearer ${tokenCliente}` })
      .send({ aprovado: true })
      .expect(200);
    expect(aprov.body.status).toBe('Em execução');

    // 6. Reserva refletida no estoque (reservado subiu)
    const pecaResv = await http
      .get(`${base}/pecas/${PECA_ID}`)
      .set(auth)
      .expect(200);
    expect(pecaResv.body.reservado).toBe(2);

    // 7. Concluir execução → baixa
    const concl = await http
      .post(`${base}/ordens-servico/${osId}/execucao/concluir`)
      .set(auth)
      .expect(200);
    expect(concl.body.status).toBe('Finalizada');

    const pecaBaixa = await http
      .get(`${base}/pecas/${PECA_ID}`)
      .set(auth)
      .expect(200);
    expect(pecaBaixa.body.saldoFisico).toBe(8); // 10 - 2
    expect(pecaBaixa.body.reservado).toBe(0);

    // 8. Pagamento + entrega
    await http
      .post(`${base}/ordens-servico/${osId}/pagamento`)
      .set(auth)
      .send({ pago: true })
      .expect(200);
    const entrega = await http
      .post(`${base}/ordens-servico/${osId}/entrega`)
      .set(auth)
      .expect(200);
    expect(entrega.body.status).toBe('Entregue');
  }, 30000);

  it('peça em falta: aprovar leva a Aguardando peça; a entrada no estoque retoma a execução', async () => {
    const http = request(app.getHttpServer());
    const base = '/api/v1';

    // Login
    const login = await http
      .post(`${base}/auth/login`)
      .send({ username: 'gestor', senha: 'gestor123' })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    // Cliente + veículo
    const cli = await http
      .post(`${base}/clientes`)
      .set(auth)
      .send({ documento: '390.533.447-05', nome: 'Ana' })
      .expect(201);
    const veic = await http
      .post(`${base}/clientes/${cli.body.id}/veiculos`)
      .set(auth)
      .send({ placa: 'QWE9F88', marca: 'Ford', modelo: 'Ka', ano: 2020 })
      .expect(201);

    // Abrir OS
    const os = await http
      .post(`${base}/ordens-servico`)
      .set(auth)
      .send({
        clienteId: cli.body.id,
        veiculoId: veic.body.id,
        problemaRelatado: 'Vazamento no motor',
      })
      .expect(201);
    const osId = os.body.id;

    // Diagnóstico com a peça SEM saldo → linha EM_COTACAO (preço cotado)
    await http
      .post(`${base}/ordens-servico/${osId}/diagnostico/iniciar`)
      .set(auth)
      .expect(200);
    const diag = await http
      .post(`${base}/ordens-servico/${osId}/diagnostico`)
      .set(auth)
      .send({
        servicos: [{ servicoId: SERVICO_ID, quantidade: 1 }],
        pecas: [{ pecaId: PECA_ESCASSA_ID, quantidade: 1 }],
      })
      .expect(200);
    const orcamentoId = diag.body.orcamento.id;
    const pecaOrcada = diag.body.orcamento.pecas.find(
      (p: { pecaId: string }) => p.pecaId === PECA_ESCASSA_ID,
    );
    expect(pecaOrcada.situacao).toBe('EM_COTACAO');

    // Aprovar (token do cliente)
    const tokenCliente = await tokenDoCliente(cli.body.id);
    const aprov = await http
      .post(`${base}/acompanhamento/${osId}/orcamentos/${orcamentoId}/resposta`)
      .set({ Authorization: `Bearer ${tokenCliente}` })
      .send({ aprovado: true })
      .expect(200);

    // Peça encomendada → OS aguardando peça (execução ainda não começou)
    expect(aprov.body.status).toBe('Aguardando peça');

    // Nada reservado ainda (a peça não existe no estoque)
    const pecaAntes = await http
      .get(`${base}/pecas/${PECA_ESCASSA_ID}`)
      .set(auth)
      .expect(200);
    expect(pecaAntes.body.reservado).toBe(0);
    expect(pecaAntes.body.saldoFisico).toBe(0);

    // Conclusão é barrada enquanto a peça não chega
    await http
      .post(`${base}/ordens-servico/${osId}/execucao/concluir`)
      .set(auth)
      .expect(400);

    // ENTRADA da peça no estoque → atende a encomenda e retoma a execução
    const ajuste = await http
      .patch(`${base}/pecas/${PECA_ESCASSA_ID}/estoque`)
      .set(auth)
      .send({ tipo: 'ENTRADA', quantidade: 1, motivo: 'Recebimento de compra' })
      .expect(200);
    // Entrou 1 e foi imediatamente reservado para a OS
    expect(ajuste.body.saldoFisico).toBe(1);
    expect(ajuste.body.reservado).toBe(1);

    // A OS retomou sozinha para Em execução
    const acompOS = await http
      .get(`${base}/acompanhamento/${osId}`)
      .set({ Authorization: `Bearer ${tokenCliente}` })
      .expect(200);
    expect(acompOS.body.status).toBe('Em execução');

    // Agora conclui e baixa a peça
    const concl = await http
      .post(`${base}/ordens-servico/${osId}/execucao/concluir`)
      .set(auth)
      .expect(200);
    expect(concl.body.status).toBe('Finalizada');
    const pecaFim = await http
      .get(`${base}/pecas/${PECA_ESCASSA_ID}`)
      .set(auth)
      .expect(200);
    expect(pecaFim.body.saldoFisico).toBe(0); // 1 - 1
    expect(pecaFim.body.reservado).toBe(0);
  }, 30000);

  it('recusa entrada inválida com 400 e envelope padrão, sem chegar ao banco', async () => {
    const http = request(app.getHttpServer());
    const base = '/api/v1';
    const login = await http
      .post(`${base}/auth/login`)
      .send({ username: 'gestor', senha: 'gestor123' })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    // Data que não é ISO-8601: antes descia até o Prisma e virava 500.
    const dataInvalida = await http
      .get(`${base}/relatorios/tempo-medio-execucao?inicio=abacaxi`)
      .set(auth)
      .expect(400);
    expect(dataInvalida.body.erro.codigo).toBe('VALIDACAO');
    expect(dataInvalida.body.erro.detalhes).toEqual(expect.any(Array));

    // Período coerente é regra do caso de uso (também 400).
    const periodoInvertido = await http
      .get(
        `${base}/relatorios/tempo-medio-execucao?inicio=2026-06-30&fim=2026-06-01`,
      )
      .set(auth)
      .expect(400);
    expect(periodoInvertido.body.erro.codigo).toBe('VALIDACAO');

    // Status fora da máquina de estados não é filtro válido.
    await http
      .get(`${base}/ordens-servico?status=INVENTADO`)
      .set(auth)
      .expect(400);
  }, 30000);

  it('cadastro duplicado responde 409 mesmo quando quem barra é o banco', async () => {
    const http = request(app.getHttpServer());
    const base = '/api/v1';
    const login = await http
      .post(`${base}/auth/login`)
      .send({ username: 'gestor', senha: 'gestor123' })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    const documento = '86288366757';
    await http
      .post(`${base}/clientes`)
      .set(auth)
      .send({ documento, nome: 'Carlos' })
      .expect(201);

    // Duas gravações concorrentes com o mesmo documento: a checagem prévia do
    // caso de uso não é atômica, então uma delas chega ao banco e volta P2002 —
    // que o tradutor converte para o mesmo 409 do caminho feliz.
    const respostas = await Promise.all([
      http.post(`${base}/clientes`).set(auth).send({ documento, nome: 'A' }),
      http.post(`${base}/clientes`).set(auth).send({ documento, nome: 'B' }),
    ]);

    for (const resposta of respostas) {
      expect(resposta.status).toBe(409);
      expect(resposta.body.erro.codigo).toBe('CONFLITO');
    }
  }, 30000);

  it('cliente só enxerga e responde as próprias OSs; token de cliente não abre rota administrativa', async () => {
    const http = request(app.getHttpServer());
    const base = '/api/v1';
    const login = await http
      .post(`${base}/auth/login`)
      .send({ username: 'gestor', senha: 'gestor123' })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    const cli = await http
      .post(`${base}/clientes`)
      .set(auth)
      .send({ documento: '11144477735', nome: 'João' })
      .expect(201);
    const veic = await http
      .post(`${base}/clientes/${cli.body.id}/veiculos`)
      .set(auth)
      .send({ placa: 'XYZ4B56', marca: 'Fiat', modelo: 'Uno', ano: 2015 })
      .expect(201);
    const os = await http
      .post(`${base}/ordens-servico`)
      .set(auth)
      .send({
        clienteId: cli.body.id,
        veiculoId: veic.body.id,
        problemaRelatado: 'Revisão',
      })
      .expect(201);
    await http
      .post(`${base}/ordens-servico/${os.body.id}/diagnostico/iniciar`)
      .set(auth)
      .expect(200);
    const diag = await http
      .post(`${base}/ordens-servico/${os.body.id}/diagnostico`)
      .set(auth)
      .send({ servicos: [{ servicoId: SERVICO_ID, quantidade: 1 }] })
      .expect(200);

    const dono = {
      Authorization: `Bearer ${await tokenDoCliente(cli.body.id)}`,
    };
    const outro = {
      Authorization: `Bearer ${await tokenDoCliente(CLIENTE_DESCONHECIDO)}`,
    };
    const resposta = `${base}/acompanhamento/${os.body.id}/orcamentos/${diag.body.orcamento.id}/resposta`;

    // Sem token → 401
    await http.get(`${base}/acompanhamento`).expect(401);
    await http.get(`${base}/acompanhamento/${os.body.id}`).expect(401);

    // O dono lista as próprias OSs (com o id para navegar) e abre a OS
    const lista = await http
      .get(`${base}/acompanhamento`)
      .set(dono)
      .expect(200);
    expect(lista.body.map((o: { id: string }) => o.id)).toContain(os.body.id);
    await http
      .get(`${base}/acompanhamento/${os.body.id}`)
      .set(dono)
      .expect(200);

    // Token de OUTRO cliente → não vê a OS na lista, e abrir/responder é 403
    const listaOutro = await http
      .get(`${base}/acompanhamento`)
      .set(outro)
      .expect(200);
    expect(listaOutro.body).toEqual([]);
    await http
      .get(`${base}/acompanhamento/${os.body.id}`)
      .set(outro)
      .expect(403);
    await http.post(resposta).set(outro).send({ aprovado: true }).expect(403);

    // Token de cliente em rota administrativa → 403 (mesmo segredo, papel errado)
    await http.get(`${base}/clientes`).set(dono).expect(403);
    // Token de operador nas rotas do cliente → 401 (não é token de cliente)
    await http.get(`${base}/acompanhamento`).set(auth).expect(401);

    // O dono responde normalmente
    const aprov = await http
      .post(resposta)
      .set(dono)
      .send({ aprovado: true })
      .expect(200);
    expect(aprov.body.status).toBe('Em execução');
  }, 30000);

  it('gestor corrige o status pela rota administrativa, dentro da máquina de estados', async () => {
    const http = request(app.getHttpServer());
    const base = '/api/v1';
    const login = await http
      .post(`${base}/auth/login`)
      .send({ username: 'gestor', senha: 'gestor123' })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    const cli = await http
      .post(`${base}/clientes`)
      .set(auth)
      .send({ documento: '453.178.287-91', nome: 'Rita' })
      .expect(201);
    const veic = await http
      .post(`${base}/clientes/${cli.body.id}/veiculos`)
      .set(auth)
      .send({ placa: 'RTA2H44', marca: 'Honda', modelo: 'Fit', ano: 2019 })
      .expect(201);
    const os = await http
      .post(`${base}/ordens-servico`)
      .set(auth)
      .send({
        clienteId: cli.body.id,
        veiculoId: veic.body.id,
        problemaRelatado: 'Revisão',
      })
      .expect(201);

    // Pular etapas continua sendo 422: a rota corrige, não fura o fluxo.
    const pulo = await http
      .patch(`${base}/ordens-servico/${os.body.id}/status`)
      .set(auth)
      .send({ status: 'FINALIZADA' })
      .expect(422);
    expect(pulo.body.erro.codigo).toBe('TRANSICAO_INVALIDA');

    // Status inexistente para no DTO, antes do domínio.
    await http
      .patch(`${base}/ordens-servico/${os.body.id}/status`)
      .set(auth)
      .send({ status: 'INVENTADO' })
      .expect(400);

    // Cliente desistiu: cancelamento manual a partir de Recebida.
    const cancelada = await http
      .patch(`${base}/ordens-servico/${os.body.id}/status`)
      .set(auth)
      .send({ status: 'CANCELADA' })
      .expect(200);
    expect(cancelada.body.status).toBe('Cancelada');
    expect(cancelada.body.historico.at(-1).por).toBe('gestor');
  }, 30000);
});
