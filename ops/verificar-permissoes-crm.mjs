// A imagem nova executa esta sonda com DATABASE_URL do papel da aplicação.
// Não lê registros de clientes, não concede permissões e não altera o banco.
export const PERMISSOES_CRM = [
  ...["deals", "lead_profiles", "lead_contacts", "lead_proposals"].flatMap((tabela) =>
    ["SELECT", "INSERT", "UPDATE"].map((privilegio) => [tabela, privilegio])),
  ...["SELECT", "INSERT", "UPDATE", "DELETE"].map((privilegio) => ["lead_documents", privilegio]),
  ["lead_proposal_templates", "SELECT"],
  ["lead_proposal_versions", "SELECT"],
  ["lead_proposal_versions", "INSERT"],
  ["deals_number_seq", "USAGE"],
  ["lead_proposals_number_seq", "USAGE"],
];

class PermissoesInsuficientes extends Error {}

export async function conferirPermissoesCrm(consultar) {
  // Os valores são constantes versionadas acima; não recebem entrada do ambiente.
  const valores = PERMISSOES_CRM.map(([relacao, privilegio]) => `('${relacao}', '${privilegio}')`).join(",\n");
  const linhas = await consultar(`
    WITH exigencias(relacao, privilegio) AS (VALUES ${valores})
    SELECT relacao, privilegio,
      CASE WHEN privilegio = 'USAGE'
        THEN has_sequence_privilege(current_user, to_regclass('public.' || relacao), privilegio)
        ELSE has_table_privilege(current_user, to_regclass('public.' || relacao), privilegio)
      END AS permitido
    FROM exigencias
  `);
  const faltas = PERMISSOES_CRM.filter(([relacao, privilegio]) =>
    !linhas.some((linha) => linha.relacao === relacao && linha.privilegio === privilegio && linha.permitido === true));
  if (faltas.length) {
    throw new PermissoesInsuficientes(`O papel da API não tem as permissões necessárias: ${faltas.map(([relacao, privilegio]) => `${relacao}.${privilegio}`).join(", ")}.`);
  }
}

if (process.argv[2] === "--verificar-permissoes-crm") {
  let prisma;
  try {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    await conferirPermissoesCrm((sql) => prisma.$queryRawUnsafe(sql));
    console.log("Permissões do CRM confirmadas com o papel da aplicação, sem leitura de dados pessoais.");
  } catch (erro) {
    console.error(erro instanceof PermissoesInsuficientes ? erro.message
      : "Não foi possível conferir as permissões do CRM com o papel da aplicação.");
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}
