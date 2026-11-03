import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const username = 'gestor';
  // A senha vem do ambiente: no cluster, do Secret criado pelo pipeline; no
  // docker-compose, de um padrão só para desenvolvimento. Sem ela o seed para,
  // para nunca subir um gestor com senha conhecida.
  const senhaPlana = process.env.SEED_GESTOR_SENHA;
  if (!senhaPlana) {
    throw new Error(
      'SEED_GESTOR_SENHA não definida: o gestor não é criado sem senha.',
    );
  }
  const senhaHash = await bcrypt.hash(senhaPlana, 10);

  // O update regrava a senha: trocar o secret e fazer deploy troca a senha.
  await prisma.usuario.upsert({
    where: { username },
    update: { senhaHash },
    create: {
      username,
      senhaHash,
      papel: 'GESTOR',
    },
  });

  // Catálogo de serviços (dados de exemplo para testar o diagnóstico).
  await prisma.servico.createMany({
    data: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        nome: 'Troca de óleo',
        descricao: 'Troca de óleo e filtro',
        precoBase: 120.0,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        nome: 'Alinhamento e balanceamento',
        precoBase: 90.0,
      },
    ],
    skipDuplicates: true,
  });

  // Estoque: uma peça com saldo e uma sem (força a cotação no diagnóstico).
  await prisma.peca.createMany({
    data: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        codigo: 'FILTRO-OLEO',
        nome: 'Filtro de óleo',
        precoUnitario: 35.0,
        saldoFisico: 10,
        reservado: 0,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        codigo: 'PASTILHA-FREIO',
        nome: 'Pastilha de freio',
        precoUnitario: 180.0,
        saldoFisico: 0,
        reservado: 0,
      },
    ],
    skipDuplicates: true,
  });

  // eslint-disable-next-line no-console
  console.log(
    `Seed concluído. Usuário="${username}" (GESTOR); 2 serviços e 2 peças de exemplo.`,
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
