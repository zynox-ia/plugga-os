import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// @node-rs/argon2 defaults to Argon2id; keep params aligned with PasswordService.
const argon2Options = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const roleRows = [
  { key: 'admin', name: 'Administração' },
  { key: 'diretoria', name: 'Diretoria' },
  { key: 'comercial', name: 'Comercial' },
  { key: 'financeiro', name: 'Financeiro' },
  { key: 'pluggamob', name: 'PluggaMob' },
  { key: 'opm', name: 'OPM' },
  { key: 'tech', name: 'Tecnologia' },
  { key: 'viewer', name: 'Leitura' },
] as const;

const integrationRows = [
  { key: 'bitrix', name: 'Bitrix', owner: 'Operações' },
  { key: 'omie', name: 'OMIE', owner: 'Financeiro' },
  { key: 'pluggamob-ocpp', name: 'PluggaMob / OCPP', owner: 'PluggaMob' },
  { key: 'pagbank', name: 'PagBank', owner: 'Financeiro' },
  { key: 'whatsapp', name: 'WhatsApp', owner: 'Operações' },
  { key: 'telegram', name: 'Telegram', owner: 'Tecnologia' },
  { key: 'rapidapi', name: 'RapidAPI', owner: 'Tecnologia' },
] as const;

const companyRows = [
  { id: 'plugga', name: 'Plugga' },
  { id: 'waze', name: 'Waze Energia' },
] as const;

/** Whether a seeded identity already exists — decides bootstrap vs. re-seed. */
async function userExists(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return user !== null;
}

type CompanyGrant = {
  companyId: 'plugga' | 'waze';
  roles: readonly string[];
  departments: readonly { id: string; isManager?: boolean }[];
};

/**
 * Concede acesso a quem acabou de ser criado. Como o resto do seed, só roda no
 * bootstrap da identidade: reconceder a cada `pnpm db:seed` desfaria uma
 * revogação feita pela tela de Equipe — o mesmo problema silencioso que já
 * guarda `status`.
 */
async function grantAccess(
  userId: string,
  roleIdByKey: Map<string, string>,
  grant: { platformRoles?: readonly string[]; companies?: readonly CompanyGrant[] },
): Promise<void> {
  for (const key of grant.platformRoles ?? []) {
    const roleId = roleIdByKey.get(key);
    if (roleId) {
      await prisma.userPlatformRole.createMany({ data: [{ userId, roleId }], skipDuplicates: true });
    }
  }

  for (const company of grant.companies ?? []) {
    await prisma.userCompanyMembership.createMany({
      data: [{ userId, companyId: company.companyId }],
      skipDuplicates: true,
    });
    await prisma.userCompanyRole.createMany({
      data: company.roles.flatMap((key) => {
        const roleId = roleIdByKey.get(key);
        return roleId ? [{ userId, companyId: company.companyId, roleId }] : [];
      }),
      skipDuplicates: true,
    });
    await prisma.userDepartmentAccess.createMany({
      data: company.departments.map((department) => ({
        userId,
        companyId: company.companyId,
        departmentId: department.id,
        isManager: department.isManager ?? false,
      })),
      skipDuplicates: true,
    });
  }
}

async function main() {
  const roles = await Promise.all(
    roleRows.map((role) =>
      prisma.role.upsert({
        where: { key: role.key },
        update: { name: role.name },
        create: role,
      }),
    ),
  );
  const roleIdByKey = new Map(roles.map((role) => [role.key, role.id]));

  // Catálogo fixo de empresas: os mesmos ids que a navegação da web usa.
  await Promise.all(
    companyRows.map((company) =>
      prisma.company.upsert({
        where: { id: company.id },
        update: { name: company.name },
        create: company,
      }),
    ),
  );

  // `status` is seeded on creation only. It is an access-revocation control
  // (ADR-0008), not cosmetic state: re-asserting 'active' here would let
  // `pnpm db:seed` silently reactivate a user an admin had deactivated.
  const devUserExisted = await userExists('dev@plugga.local');
  const devUser = await prisma.user.upsert({
    where: { email: 'dev@plugga.local' },
    update: { name: 'Pessoa Desenvolvedora Local' },
    create: {
      email: 'dev@plugga.local',
      name: 'Pessoa Desenvolvedora Local',
      status: 'active',
    },
  });

  if (!devUserExisted) {
    await grantAccess(devUser.id, roleIdByKey, { platformRoles: ['admin'] });
  }

  // Real self-hosted admin for local login (ADR-0008). Password comes only from
  // the local environment; never hardcoded or committed.
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@plugga.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  // Same rules as the dev user: never re-activate, never re-grant on re-seed.
  const adminUserExisted = await userExists(adminEmail);
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: 'Administração Local' },
    create: { email: adminEmail, name: 'Administração Local', status: 'active' },
  });

  // Admin é papel de plataforma: alcança Plugga e Waze sem membership nenhum,
  // porque o alcance dele é regra, não concessão.
  if (!adminUserExisted) {
    await grantAccess(adminUser.id, roleIdByKey, { platformRoles: ['admin'] });
  }

  if (adminPassword) {
    const passwordHash = await hash(adminPassword, argon2Options);
    await prisma.userCredential.upsert({
      where: { userId: adminUser.id },
      update: { passwordHash },
      create: { userId: adminUser.id, passwordHash },
    });
  } else {
    console.warn(
      'SEED_ADMIN_PASSWORD is not set; admin user created without a login credential.',
    );
  }

  // Equipe de exemplo: as quatro formas de acesso que a autorização precisa
  // distinguir, para conferir a regra logando em vez de lendo o código.
  //
  // Fica atrás de SEED_SAMPLE_TEAM porque cria contas que fazem login com a
  // MESMA senha local do admin: útil na máquina de quem desenvolve, inaceitável
  // em qualquer ambiente que não seja o seu. Sem a variável, nada é criado.
  if (process.env.SEED_SAMPLE_TEAM === 'true' && adminPassword) {
    const sampleTeam = [
      {
        email: 'financeiro.plugga@plugga.local',
        name: 'Financeiro Plugga (exemplo)',
        grant: {
          companies: [
            {
              companyId: 'plugga' as const,
              roles: ['financeiro'],
              departments: [{ id: 'financeiro' }],
            },
          ],
        },
      },
      {
        email: 'gestor.energia@plugga.local',
        name: 'Gestor de Energia (exemplo)',
        grant: {
          companies: [
            {
              companyId: 'plugga' as const,
              roles: ['opm'],
              departments: [{ id: 'energia-opm', isManager: true }],
            },
          ],
        },
      },
      {
        email: 'duas.empresas@plugga.local',
        name: 'Acesso nas duas empresas (exemplo)',
        grant: {
          companies: [
            {
              companyId: 'plugga' as const,
              roles: ['comercial'],
              departments: [{ id: 'comercial-clientes' }],
            },
            {
              companyId: 'waze' as const,
              roles: ['viewer'],
              departments: [{ id: 'engenharia-obras' }],
            },
          ],
        },
      },
    ];

    const samplePasswordHash = await hash(adminPassword, argon2Options);
    for (const sample of sampleTeam) {
      if (await userExists(sample.email)) {
        continue;
      }
      const user = await prisma.user.create({
        data: { email: sample.email, name: sample.name, status: 'active' },
      });
      await grantAccess(user.id, roleIdByKey, sample.grant);
      await prisma.userCredential.create({
        data: { userId: user.id, passwordHash: samplePasswordHash },
      });
    }
  }

  const integrations = await Promise.all(
    integrationRows.map((integration) =>
      prisma.integration.upsert({
        where: { key: integration.key },
        // Refresh catalog metadata only. `mode` is a cutover decision (ADR-0005/
        // 0009) and `status`/`lastSyncAt`/`lastError` are operational state — a
        // re-seed must never silently revert them. Without this, flipping an
        // integration to read_only would be undone by the next `pnpm db:seed`,
        // closing the migrator's gate and looking like an unexplained regression.
        update: {
          name: integration.name,
          owner: integration.owner,
        },
        create: {
          ...integration,
          mode: 'mock',
          status: 'unknown',
        },
      }),
    ),
  );

  const integrationByKey = new Map(
    integrations.map((integration) => [integration.key, integration]),
  );

  await prisma.jobRun.createMany({
    data: [
      {
        id: '00000000-0000-4000-8000-000000000101',
        jobKey: 'inventory.bitrix-sync',
        integrationId: integrationByKey.get('bitrix')?.id,
        scheduledFor: new Date('2026-08-06T12:00:00.000Z'),
        status: 'skipped',
        attempt: 1,
        triggeredBy: 'seed:inventory-only',
        logRef: 'mock://job-runs/inventory-bitrix-sync',
      },
      {
        id: '00000000-0000-4000-8000-000000000102',
        jobKey: 'inventory.omie-sync',
        integrationId: integrationByKey.get('omie')?.id,
        scheduledFor: new Date('2026-08-06T12:05:00.000Z'),
        status: 'skipped',
        attempt: 1,
        triggeredBy: 'seed:inventory-only',
        logRef: 'mock://job-runs/inventory-omie-sync',
      },
      {
        id: '00000000-0000-4000-8000-000000000103',
        jobKey: 'inventory.whatsapp-health',
        integrationId: integrationByKey.get('whatsapp')?.id,
        scheduledFor: new Date('2026-08-06T12:10:00.000Z'),
        status: 'skipped',
        attempt: 1,
        triggeredBy: 'seed:inventory-only',
        logRef: 'mock://job-runs/inventory-whatsapp-health',
      },
    ],
    skipDuplicates: true,
  });

  // PluggaMob is local/mock in this phase. Bootstrap only an empty domain so a
  // second seed never replaces an opt-out, incident, or settlement decision.
  if (await prisma.evUser.count() === 0) {
    const partner = await prisma.partner.create({
      data: {
        key: 'ev-point',
        name: 'EV Point',
        locations: {
          create: {
            name: 'EV Point 01',
            status: 'active',
            stations: { create: { name: 'Estação principal', connectors: { create: { label: 'C1', status: 'available' } } } },
          },
        },
      },
      include: { locations: { include: { stations: { include: { connectors: true } } } } },
    });
    const user = await prisma.evUser.create({
      data: {
        externalId: 'mock-user-001',
        displayName: 'Usuário EV Local',
        phoneMasked: '(92) 9••••-0101',
        segment: 'r1',
        walletBalance: '48.00',
        segmentHistory: { create: { segment: 'r1' } },
      },
    });
    const location = partner.locations[0];
    const connector = location.stations[0]?.connectors[0];
    await prisma.evSession.create({
      data: {
        externalId: 'mock-session-001',
        userId: user.id,
        locationId: location.id,
        connectorId: connector?.id,
        tokenRfid: 'MOCK-RFID-001',
        status: 'completed',
        startedAt: new Date('2026-08-06T12:00:00.000Z'),
        endedAt: new Date('2026-08-06T12:45:00.000Z'),
        kwh: '12.500',
        amount: '48.00',
      },
    });
  }

  // Energia & OPM foundation: one sample client + consumer unit so tickets
  // 2-4 have a real UC to attach migrations/cycles to. Guarded so a re-seed
  // never resets an active migration/cycle/audit state.
  if (await prisma.consumerUnit.count() === 0) {
    const client = await prisma.client.upsert({
      where: { id: '00000000-0000-0000-0000-0000000000c1' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-0000000000c1',
        name: 'Cliente Energia Seed',
        segment: 'opm',
      },
    });
    await prisma.consumerUnit.create({
      data: {
        clientId: client.id,
        code: 'UC-0001',
        distributor: 'Amazonas Energia',
        address: 'Manaus, AM',
      },
    });
  }
  // Premissas do estudo de eficiência energética (ADR/decisões 2026-08-08).
  // Idempotente como o resto do seed: reexecutar não sobrescreve uma versão já
  // cadastrada, porque estudo antigo aponta para ela e precisa continuar
  // explicável pelo que valia na época.
  await prisma.energyPremiseVersion.upsert({
    where: { versao: '2026-08-08' },
    update: {},
    create: {
      versao: '2026-08-08',
      vigenteDe: new Date('2026-08-08T00:00:00.000Z'),
      bessModelo: 'Huawei LUNA2000-241-2S1',
      bessCapacidadeNominalKwh: 241,
      bessCapacidadeUtilKwh: 241,
      bessPotenciaKw: 108,
      bessEficienciaCiclo: 0.913,
      bessCapexPorUnidade: 550000,
      fvCapexPorKwp: 2500,
      fvProdutividadeKwhPorKwpMes: 130,
      fvPercentualAtendimento: 0.6,
      horizonteAnos: 20,
      tmaAnual: 0.05,
      reajusteTarifarioAnual: 0.04,
      toleranciaUltrapassagem: 0.05,
      alteracaoDemandaMinima: 0.05,
      alteracaoDemandaMaxima: 0.2,
    },
  });

}

main()
  .catch((error: unknown) => {
    console.error('Failed to seed local foundation data.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
