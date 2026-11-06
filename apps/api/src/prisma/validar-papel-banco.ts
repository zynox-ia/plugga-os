import type { PrismaClient } from "@prisma/client";

type Grupo = "plugga_runtime" | "plugga_auth_runtime" | "plugga_jobs_runtime";
const controles = ["loginSeguro", "grupoCorreto", "semOutrosPools", "semPapelPrivilegiado", "semDono", "semDDL", "semTruncate", "escopoDoPool", "rlsAtiva"] as const;
type Verificacao = Record<(typeof controles)[number], boolean>;

export async function validarPapelBanco(prisma: PrismaClient, grupo: Grupo): Promise<void> {
  // A suíte unitária instancia AppModule sem infraestrutura; a suíte RLS é explícita.
  if (process.env.NODE_ENV === "test" && process.env.RUN_RLS_INTEGRATION_TESTS !== "true") return;

  let resultado: Verificacao | undefined;
  try {
    [resultado] = await prisma.$queryRaw<Verificacao[]>`
      WITH objetos AS (
        SELECT c.*, n.nspname FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('public', 'plugga_security')
      )
      SELECT
        current_user = session_user AND r.rolcanlogin AND r.rolinherit
          AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication) AS "loginSeguro",
        EXISTS (SELECT 1 FROM pg_catalog.pg_roles g WHERE g.rolname = ${grupo}
          AND pg_catalog.pg_has_role(g.oid, 'USAGE')
          AND NOT (g.rolcanlogin OR g.rolsuper OR g.rolbypassrls OR g.rolcreatedb OR g.rolcreaterole OR g.rolreplication)
          AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = g.oid)) AS "grupoCorreto",
        NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles g
          WHERE g.rolname IN ('plugga_runtime', 'plugga_auth_runtime', 'plugga_jobs_runtime')
            AND g.rolname <> ${grupo} AND pg_catalog.pg_has_role(g.oid, 'MEMBER')) AS "semOutrosPools",
        NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles p
          WHERE pg_catalog.pg_has_role(p.oid, 'MEMBER')
            AND (p.rolsuper OR p.rolbypassrls OR p.rolcreatedb OR p.rolcreaterole OR p.rolreplication
              OR p.rolname IN ('pg_read_all_data', 'pg_write_all_data', 'pg_read_server_files', 'pg_write_server_files', 'pg_execute_server_program'))) AS "semPapelPrivilegiado",
        NOT EXISTS (SELECT 1 FROM objetos o WHERE pg_catalog.pg_has_role(o.relowner, 'MEMBER'))
          AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname IN ('public', 'plugga_security') AND pg_catalog.pg_has_role(p.proowner, 'MEMBER'))
          AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
            WHERE n.nspname IN ('public', 'plugga_security') AND pg_catalog.pg_has_role(n.nspowner, 'MEMBER')) AS "semDono",
        NOT pg_catalog.has_database_privilege(current_database(), 'CREATE')
          AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public', 'plugga_security')
            AND pg_catalog.has_schema_privilege(n.oid, 'CREATE')) AS "semDDL",
        NOT EXISTS (SELECT 1 FROM objetos o WHERE o.relkind IN ('r', 'p')
          AND pg_catalog.has_table_privilege(o.oid, 'TRUNCATE, TRIGGER')) AS "semTruncate",
        NOT EXISTS (SELECT 1 FROM objetos o WHERE o.nspname = 'public' AND o.relkind IN ('r', 'p')
          AND pg_catalog.has_table_privilege(o.oid, 'SELECT, INSERT, UPDATE, DELETE')
          AND CASE ${grupo}::text
            WHEN 'plugga_auth_runtime' THEN o.relname NOT IN ('users', 'user_credentials', 'user_identities', 'sessions', 'auth_tokens', 'roles', 'user_platform_roles', 'user_departamentos', 'agent_identities', 'event_log')
            WHEN 'plugga_jobs_runtime' THEN o.relname NOT IN ('integrations', 'bitrix_mirror_records', 'job_runs', 'event_log')
            ELSE o.relname IN ('user_credentials', 'user_identities', 'sessions', 'auth_tokens', 'agent_identities', '_prisma_migrations')
          END) AS "escopoDoPool",
        NOT EXISTS (SELECT 1 FROM objetos o WHERE o.nspname = 'public' AND o.relkind IN ('r', 'p')
          AND o.relname <> '_prisma_migrations' AND NOT (o.relrowsecurity AND o.relforcerowsecurity)) AS "rlsAtiva"
      FROM pg_catalog.pg_roles r WHERE r.rolname = current_user`;
  } catch {
    throw new Error(`Não foi possível validar o isolamento do pool ${grupo}.`);
  }
  if (!resultado || controles.some((controle) => resultado[controle] !== true)) {
    throw new Error(`O papel do pool ${grupo} não atende ao isolamento obrigatório do banco.`);
  }
}
