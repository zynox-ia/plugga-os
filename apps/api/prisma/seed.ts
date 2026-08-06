import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const roleRows = [
  { key: 'diretoria', name: 'Diretoria' },
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

  const devUser = await prisma.user.upsert({
    where: { email: 'dev@plugga.local' },
    update: { name: 'Pessoa Desenvolvedora Local', status: 'active' },
    create: {
      email: 'dev@plugga.local',
      name: 'Pessoa Desenvolvedora Local',
      status: 'active',
    },
  });

  await prisma.userRole.createMany({
    data: roles.map((role) => ({ userId: devUser.id, roleId: role.id })),
    skipDuplicates: true,
  });

  const integrations = await Promise.all(
    integrationRows.map((integration) =>
      prisma.integration.upsert({
        where: { key: integration.key },
        update: {
          name: integration.name,
          owner: integration.owner,
          mode: 'mock',
          status: 'unknown',
          lastSyncAt: null,
          lastError: null,
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
}

main()
  .catch((error: unknown) => {
    console.error('Failed to seed local foundation data.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
