-- Executar com psql no banco alvo aprovado, após a migration:
-- psql -v runtime_role=nome_app -v auth_role=nome_auth -v jobs_role=nome_jobs -f ops/configurar-papeis-aplicacao.sql
-- Provisionar os três logins e suas credenciais no gestor de segredos, fora
-- deste arquivo. O script só valida e concede grupos, nunca cria senha/login.
\set ON_ERROR_STOP on
\if :{?runtime_role}
\else
  \echo 'Informe runtime_role, auth_role e jobs_role.'
  \quit 1
\endif
\if :{?auth_role}
\else
  \echo 'Informe auth_role.'
  \quit 1
\endif
\if :{?jobs_role}
\else
  \echo 'Informe jobs_role.'
  \quit 1
\endif

BEGIN;
SELECT set_config('plugga.ops_runtime_role', :'runtime_role', true);
SELECT set_config('plugga.ops_auth_role', :'auth_role', true);
SELECT set_config('plugga.ops_jobs_role', :'jobs_role', true);
DO $configurar$
DECLARE
  nomes text[] := ARRAY[current_setting('plugga.ops_runtime_role'), current_setting('plugga.ops_auth_role'), current_setting('plugga.ops_jobs_role')];
  grupos text[] := ARRAY['plugga_runtime', 'plugga_auth_runtime', 'plugga_jobs_runtime'];
  nome text;
  indice integer;
  alvo oid;
  grupo_id oid;
BEGIN
  IF (SELECT count(DISTINCT n) FROM unnest(nomes) n) <> 3 THEN
    RAISE EXCEPTION 'Os pools exigem três logins distintos';
  END IF;
  FOR indice IN 1..3 LOOP
    nome := nomes[indice];
    IF nome !~ '^[a-z][a-z0-9_]{0,62}$' OR nome = ANY(grupos) THEN
      RAISE EXCEPTION 'Nome de login inválido';
    END IF;
    SELECT oid INTO alvo FROM pg_catalog.pg_roles WHERE rolname = nome AND rolcanlogin AND rolinherit
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication;
    IF alvo IS NULL THEN RAISE EXCEPTION 'Login ausente ou com atributos privilegiados: %', nome; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = grupos[indice]
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid = m.member WHERE r.rolname = grupos[indice]) THEN
      RAISE EXCEPTION 'Grupo de aplicação ausente ou inseguro';
    END IF;
    SELECT oid INTO grupo_id FROM pg_catalog.pg_roles WHERE rolname = grupos[indice];
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid <> alvo AND pg_has_role(alvo, r.oid, 'MEMBER')
      AND r.rolname <> grupos[indice]) THEN
      RAISE EXCEPTION 'Login dedicado só pode herdar o grupo de seu pool: %', nome;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname IN ('public', 'plugga_security') AND (pg_has_role(alvo, c.relowner, 'MEMBER') OR pg_has_role(grupo_id, c.relowner, 'MEMBER')))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
        WHERE s.nspname = 'plugga_security' AND (pg_has_role(alvo, p.proowner, 'MEMBER') OR pg_has_role(grupo_id, p.proowner, 'MEMBER'))) THEN
      RAISE EXCEPTION 'Login é dono ou membro do dono de objetos protegidos: %', nome;
    END IF;
    IF has_database_privilege(alvo, current_database(), 'CREATE')
      OR has_schema_privilege(alvo, 'public', 'CREATE')
      OR has_schema_privilege(alvo, 'plugga_security', 'CREATE')
      OR has_database_privilege(grupo_id, current_database(), 'CREATE')
      OR has_schema_privilege(grupo_id, 'public', 'CREATE')
      OR has_schema_privilege(grupo_id, 'plugga_security', 'CREATE')
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace s ON s.oid = c.relnamespace
        WHERE s.nspname = 'public' AND c.relkind IN ('r', 'p') AND (has_table_privilege(alvo, c.oid, 'TRUNCATE') OR has_table_privilege(grupo_id, c.oid, 'TRUNCATE'))) THEN
      RAISE EXCEPTION 'Remova CREATE/DDL/TRUNCATE antes de usar o login: %', nome;
    END IF;
  END LOOP;
  -- Validar todos antes de conceder: falha faz rollback do conjunto.
  FOR indice IN 1..3 LOOP
    EXECUTE format('GRANT %I TO %I', grupos[indice], nomes[indice]);
  END LOOP;
END $configurar$;
COMMIT;
